import Joi from "joi";
import jwt from 'jsonwebtoken'
import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcrypt';
import path from 'path'
import dotenv from "dotenv";
import crypto from 'crypto'
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import hbs from "nodemailer-express-handlebars";
import Stripe from "stripe";
import { generateOTP, generateRandomUICNumber, getActivePlanForUser, getReportedAssetIds, getReportedUserIds } from "../utils/helper.js";
import { createNormalNotificationForAdmin, sendNotification, sendNotificationEmail } from "../utils/helpers/notification.service.js";
dotenv.config();
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SINCH_APPLICATION_KEY = process.env.SINCH_APPLICATION_KEY
const SINCH_APPLICATION_SECRET = process.env.SINCH_APPLICATION_SECRET
const SINCH_BASE_URL = process.env.SINCH_BASE_URL;
const stripe = new Stripe(process.env.STRIPE_SECRET_USER_CONTROLLER);


const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }

});

// var transporter = nodemailer.createTransport({
//     // service: 'gmail',
//     host: "smtp.gmail.com",
//     port: 587,
//     // secure: true,
//     auth: {
//         user: "yashraj.ctinfotech@gmail.com",
//         pass: "lggh qqgx fkuc efwq",
//     },
// });

const handlebarOptions = {
    viewEngine: {
        partialsDir: path.resolve(__dirname, "../view/"),
        defaultLayout: false,
    },
    viewPath: path.resolve(__dirname, "../view/"),
};

transporter.use("compile", hbs(handlebarOptions));

export async function signupWithEmail(req, res) {
    const { email, phone_no, full_name, fcm_token, country } = req.body;
    console.log("here>>>>>>>>>>")

    try {
        if (email) {
            console.log(req.body);
            console.log("after")
            const schema = Joi.alternatives(Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                full_name: Joi.string().required(),
                fcm_token: Joi.string().optional(),
                country: Joi.string().required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const user = await prisma.user.findUnique({
                where: { email }
            });

            if (user && user.isVerified) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Email already registered,please login '
                });
            }

            if (!user || new Date(user.otpExpiration) < new Date()) {
                const otp = generateOTP(4)
                const otpExpiration = new Date(Date.now() + 1 * 60000); // 10 minutes from now

                let mailOptions = {
                    from: 'stuffyclub1@gmail.com',
                    to: email,
                    subject: 'Activate Account',
                    template: 'signupemail',
                    context: {
                        otp: otp,
                        imgUrl: `${baseurl}/mainLogo.png`
                    }
                };
                transporter.sendMail(mailOptions, async function (error, info) {
                    if (error) {
                        console.log(error)
                        return res.status(400).json({
                            success: false,
                            status: 400,
                            message: 'Mail Not delivered'
                        });
                    }
                    else {
                        await prisma.user.upsert({
                            where: { email },
                            update: { otp, otpExpiration, full_name },
                            create: { email, otp, otpExpiration, full_name, fcm_token, country }
                        });
                        return res.status(200).json({
                            success: true,
                            message: "Email verification required. Check your inbox for a confirmation code",
                            status: 200,
                        });
                    }
                });
            } else {
                return res.status(201).json({
                    status: 200,
                    message: 'Otp Already Send ,please check your email',
                    success: false,
                })
            }
        }
        if (phone_no) {
            console.log(req.body);
            console.log("after");

            const phoneSchema = Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
                full_name: Joi.string().required(),
                fcm_token: Joi.string().optional(),
                country: Joi.string().required()
            });

            const phoneResult = phoneSchema.validate(req.body);
            if (phoneResult.error) {
                const message = phoneResult.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: phoneResult.error.details[0].message,
                    error: message,
                    missingParams: phoneResult.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }


            const user = await prisma.user.findUnique({
                where: { phone_no }
            });

            if (user && user.isVerified) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Phone number already registered, please login'
                });
            }

            if (!user || new Date(user.otpExpiration) < new Date()) {
                const otpExpiration = new Date(Date.now() + 2 * 60000); // 10 minutes from now

                const response = await fetch(`${SINCH_BASE_URL}/verifications`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Basic ' + Buffer.from(`${SINCH_APPLICATION_KEY}:${SINCH_APPLICATION_SECRET}`).toString('base64')
                    },
                    body: JSON.stringify({
                        identity: {
                            type: 'number',
                            endpoint: phone_no
                        },
                        method: 'sms'
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    await prisma.user.upsert({
                        where: { phone_no },
                        update: { otpExpiration, full_name },
                        create: { phone_no, otpExpiration, full_name, fcm_token, country }
                    });
                    return res.status(200).json({
                        success: true,
                        message: "Phone verification required. Check your SMS for a confirmation code",
                        status: 200,
                        data
                    });
                } else {
                    console.log(data)
                    return res.status(response.status).json({ message: 'Failed to send OTP', error: data, success: false });
                }

            } else {
                return res.status(200).json({
                    status: 200,
                    message: 'OTP already sent, please check your SMS',
                    success: false,
                });
            }
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function verifyOtpEmail(req, res) {
    const { email, otp, phone_no } = req.body;

    try {
        if (email && otp) {
            const schema = Joi.alternatives(Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                otp: Joi.string().required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const user = await prisma.user.findUnique({
                where: { email }
            });

            if (user && user.otp == otp && new Date(user.otpExpiration) > new Date()) {
                await prisma.user.update({
                    where: { email },
                    data: { otp: null, otpExpiration: null, isVerified: true }
                });
                const admin = await prisma.admin.findMany();
                await Promise.all(admin.map(async (admin) => {
                    const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'New user registered', content: `New user registered: ${user.full_name} – ${email}` });
                }))
                return res.status(200).json({
                    message: 'Welcome to SecurPoint, your account has been created successfully.',
                    status: 200,
                    success: true,
                });
            } else {
                return res.status(400).json({
                    message: 'Invalid or expired OTP',
                    status: 400,
                    success: true
                });
            }
        }
        if (phone_no && otp) {
            console.log(req.body);
            console.log("after");

            const phoneSchema = Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
                otp: Joi.string().required()
            });

            const phoneResult = phoneSchema.validate({ phone_no, otp });
            if (phoneResult.error) {
                const message = phoneResult.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: phoneResult.error.details[0].message,
                    error: message,
                    missingParams: phoneResult.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }


            const user = await prisma.user.findUnique({
                where: { phone_no }
            });
            if (user) {
                const response = await fetch(`${SINCH_BASE_URL}/verifications/number/${encodeURIComponent(phone_no)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Basic ' + Buffer.from(`${SINCH_APPLICATION_KEY}:${SINCH_APPLICATION_SECRET}`).toString('base64')
                    },
                    body: JSON.stringify({
                        method: 'sms',
                        sms: { code: otp }
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    if (data.status === 'FAIL') {
                        return res.status(400).json({ message: `OTP ${data.reason}`, status: 200, success: false });
                    }
                    await prisma.user.update({
                        where: { phone_no },
                        data: { otp: null, otpExpiration: null, isVerified: true }
                    });
                    const notification = await sendNotification({ toUserIds: user.id, title: 'Registration Successfully', content: `Welcome to SecurPoint, your account has been created successfully.`, sendFCM: user.fcm_token });
                    const admin = await prisma.admin.findMany();
                    await Promise.all(admin.map(async (admin) => {
                        const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'SecurPoint', content: `New user registered: ${user.full_name} – ${phone_no}` });
                    }))
                    return res.status(200).json({
                        message: 'Welcome to SecurPoint, your account has been created successfully.',
                        status: 200,
                        success: true,
                    });
                } else {
                    res.status(response.status).json({ message: `${data.message}`, error: data });
                }
            }
            else {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'User not found'
                });
            }

        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function createPassword(req, res, next) {
    try {
        const secretKey = process.env.SECRET_KEY;
        const { email, password, phone_no } = req.body;

        console.log(req.body)

        if (email) {
            const schema = Joi.alternatives(Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                password: Joi.string().min(8).max(64).required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await prisma.user.update({
                where: {
                    email: email
                },
                data: {
                    password: hashedPassword
                }
            })
            const userSetting = await prisma.userSetting.findFirst({
                where: {
                    userId: user.id
                }
            });
            if (userSetting === null) {
                await prisma.userSetting.create({
                    data: {
                        userId: user.id
                    }
                })
            }
            const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
            return res.status(200).json({
                status: 200,
                message: 'Your password has been created successfully.',
                success: true,
                token,
                user
            })
        }
        else if (phone_no) {
            const schema = Joi.alternatives(Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
                password: Joi.string().min(8).max(64).required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await prisma.user.update({
                where: {
                    phone_no: phone_no
                },
                data: {
                    password: hashedPassword
                }
            })
            const userSetting = await prisma.userSetting.findFirst({
                where: {
                    userId: user.id
                }
            });
            if (userSetting === null) {
                await prisma.userSetting.create({
                    data: {
                        userId: user.id
                    }
                })
            }
            const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
            return res.status(200).json({
                status: 200,
                message: 'Successfully Created Password',
                success: true,
                token,
                user
            })
        } else {
            return res.status(400).json({
                status: 400,
                message: 'Email or phone_no is required',
                success: false,
            });
        }



    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function login(req, res) {
    try {
        const secretKey = process.env.SECRET_KEY;
        console.log(">>>>>>>>>>>>>>>", req.body)
        const { email, password, fcm_token, phone_no, country } = req.body;
        const schema = Joi.alternatives(
            Joi.object({
                //email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().optional(),
                phone_no: Joi.string().optional(),
                password: Joi.string().required().messages({
                    "any.required": "{{#label}} is required!!",
                    "string.empty": "can't be empty!!",
                    "string.min": "minimum 8 value required",
                    "string.max": "maximum 15 values allowed",
                }),
                fcm_token: Joi.string().optional(),
                country: Joi.string().required(),
            })
        );
        const result = schema.validate(req.body);

        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.status(400).json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        } else {

            if (email) {
                const user = await prisma.user.findUnique({
                    where: {
                        email: email
                    }
                })
                console.log('user', user);
                if (!user || !(await bcrypt.compare(password, user.password))) {

                    return res.status(400).json({
                        success: false,
                        message: "Invalid login credentials",
                        status: 400,
                    });
                }
                if (user.isVerified == false) {
                    return res.status(400).json({
                        message: "Please verify your account",
                        status: 400,
                        success: false
                    })
                }
                console.log(user.status);
                if (user.status == 0) {
                    return res.status(400).json({
                        message: "Your Account is deactivated by Administrator",
                        status: 400,
                        success: false
                    })
                }
                if (fcm_token) {
                    await prisma.user.update({
                        where: {
                            email: email
                        },
                        data: {
                            fcm_token: fcm_token
                        }
                    })
                }
                if (country) {
                    await prisma.user.update({
                        where: {
                            email: email
                        },
                        data: {
                            country: country
                        }
                    })
                }

                const userSetting = await prisma.userSetting.findFirst({
                    where: {
                        userId: user.id
                    }
                });
                if (userSetting === null) {
                    await prisma.userSetting.create({
                        data: {
                            userId: user.id
                        }
                    })
                }
                const userData = await prisma.user.findUnique({
                    where: {
                        email: email
                    },
                });

                const activeListing = await prisma.asset.count({
                    where: {
                        userId: user.id,
                        blockStatus: 1,
                        isVisible: true
                    }
                });

                userData.active_listing = activeListing;

                const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
                return res.json({
                    status: 200,
                    success: true,
                    message: "Login successful!",
                    token: token,
                    user: userData,
                });
            }
            else if (phone_no) {
                console.log(">>>>>>>>>>")
                const user = await prisma.user.findFirst({
                    where: {
                        phone_no: phone_no
                    }
                })
                if (!user || !(await bcrypt.compare(password, user.password))) {

                    return res.status(400).json({
                        success: false,
                        message: "Invalid login credentials",
                        status: 400,
                    });
                }
                if (user.isVerified === false) {
                    return res.status(400).json({
                        message: "Please verify your account",
                        status: 400,
                        success: false
                    })
                }
                if (user.status == 0) {
                    return res.status(400).json({
                        message: "Your Account is deactivated by Administrator",
                        status: 400,
                        success: false
                    })
                }
                if (fcm_token) {
                    await prisma.user.update({
                        where: {
                            id: user.id
                        },
                        data: {
                            fcm_token: fcm_token
                        }
                    })
                }

                const userData = await prisma.user.findFirst({
                    where: {
                        phone_no: phone_no
                    },
                });
                const activeListing = await prisma.asset.count({
                    where: {
                        userId: user.id,
                        blockStatus: 1,
                        isVisible: true
                    }
                });
                userData.active_listing = activeListing;
                const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
                return res.json({
                    status: 200,
                    success: true,
                    message: "Login successful!",
                    token: token,
                    user: userData,
                });
            }

        }
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            message: "An internal server error occurred. Please try again later.",
            status: 500,
            error: error,
        });
    }
}

export async function forgotPassword(req, res) {
    const { email, phone_no } = req.body;

    try {
        if (email) {
            const schema = Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
            });

            const result = schema.validate({ email });
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }

            const user = await prisma.user.findUnique({
                where: { email }
            });

            console.log('user', user);

            if (!user) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Email not registered'
                });
            }

            const otp = generateOTP(4);
            const otpExpiration = new Date(Date.now() + 1 * 60000); // 10 minutes from now

            let mailOptions = {
                from: 'stuffyclub1@gmail.com',
                to: email,
                subject: 'Password Reset Request',
                template: 'forgetPassword',
                context: {
                    otp: otp,
                    imgUrl: `${baseurl}/mainLogo.png`
                }
            };


            transporter.sendMail(mailOptions, async function (error, info) {
                if (error) {
                    console.log(error)
                    return res.status(400).json({
                        success: false,
                        status: 400,
                        message: 'Mail Not Delivered'
                    });
                } else {
                    await prisma.user.update({
                        where: { email },
                        data: { otp, otpExpiration }
                    });
                    return res.status(200).json({
                        success: true,
                        message: "OTP sent to your email. Please check your inbox.",
                        status: 200,
                    });
                }
            });
        }

        if (phone_no) {
            const phoneSchema = Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
            });

            const phoneResult = phoneSchema.validate({ phone_no });
            if (phoneResult.error) {
                const message = phoneResult.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: phoneResult.error.details[0].message,
                    error: message,
                    missingParams: phoneResult.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }

            const user = await prisma.user.findUnique({
                where: { phone_no }
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Phone number not registered'
                });
            }

            const otpExpiration = new Date(Date.now() + 1 * 60000); // 10 minutes from now

            const response = await fetch(`${SINCH_BASE_URL}/verifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Basic ' + Buffer.from(`${SINCH_APPLICATION_KEY}:${SINCH_APPLICATION_SECRET}`).toString('base64')
                },
                body: JSON.stringify({
                    identity: {
                        type: 'number',
                        endpoint: phone_no
                    },
                    method: 'sms'
                })
            });

            const data = await response.json();
            if (response.ok) {
                await prisma.user.update({
                    where: { phone_no },
                    data: { otpExpiration }
                });
                return res.status(200).json({
                    success: true,
                    message: "OTP sent to your phone. Please check your SMS.",
                    status: 200,
                    data
                });
            } else {
                console.log(data)
                return res.status(response.status).json({ message: 'Failed to send OTP', error: data, success: false });
            }
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        });
    }
}

export async function resendforgotPassword(req, res) {
    const { email, phone_no } = req.body;

    try {
        if (email) {
            const schema = Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
            });

            const result = schema.validate({ email });
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }

            const user = await prisma.user.findUnique({
                where: { email }
            });

            console.log('user', user);

            if (!user) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Email not registered'
                });
            }

            const otp = generateOTP(4);
            const otpExpiration = new Date(Date.now() + 1 * 60000); // 10 minutes from now

            let mailOptions = {
                from: 'stuffyclub1@gmail.com',
                to: email,
                subject: 'Resend OTP',
                template: 'mail_template',
                context: {
                    subject: 'Resend OTP',
                    title: `Resend OTP`,
                    message: `Enter the code below in our App to confirm your email address. If you didn't create an account with us, you can safely ignore this email.
                    <h3 style="font-size:30px; font-family: 'Helvetica', Arial, sans-serif;letter-spacing: 2.5px;" >${otp}</h3>`,
                    logo: `${baseurl}/mainLogo.png`
                }
            };


            transporter.sendMail(mailOptions, async function (error, info) {
                if (error) {
                    console.log(error)
                    return res.status(400).json({
                        success: false,
                        status: 400,
                        message: 'Mail Not Delivered'
                    });
                } else {
                    await prisma.user.update({
                        where: { email },
                        data: { otp, otpExpiration }
                    });
                    return res.status(200).json({
                        success: true,
                        message: "OTP sent to your email. Please check your inbox.",
                        status: 200,
                    });
                }
            });
        }

        if (phone_no) {
            const phoneSchema = Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
            });

            const phoneResult = phoneSchema.validate({ phone_no });
            if (phoneResult.error) {
                const message = phoneResult.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: phoneResult.error.details[0].message,
                    error: message,
                    missingParams: phoneResult.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }

            const user = await prisma.user.findUnique({
                where: { phone_no }
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'Phone number not registered'
                });
            }

            const otpExpiration = new Date(Date.now() + 1 * 60000); // 10 minutes from now

            const response = await fetch(`${SINCH_BASE_URL}/verifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Basic ' + Buffer.from(`${SINCH_APPLICATION_KEY}:${SINCH_APPLICATION_SECRET}`).toString('base64')
                },
                body: JSON.stringify({
                    identity: {
                        type: 'number',
                        endpoint: phone_no
                    },
                    method: 'sms'
                })
            });

            const data = await response.json();
            if (response.ok) {
                await prisma.user.update({
                    where: { phone_no },
                    data: { otpExpiration }
                });
                return res.status(200).json({
                    success: true,
                    message: "OTP sent to your phone. Please check your SMS.",
                    status: 200,
                    data
                });
            } else {
                console.log(data)
                return res.status(response.status).json({ message: 'Failed to send OTP', error: data, success: false });
            }
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        });
    }
}

export async function verifyForgetPasswordOtp(req, res) {
    const { email, otp, phone_no } = req.body;

    try {
        if (email && otp) {
            const schema = Joi.alternatives(Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                otp: Joi.string().required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const user = await prisma.user.findUnique({
                where: { email }
            });

            if (user && user.otp === otp && new Date(user.otpExpiration) > new Date()) {
                await prisma.user.update({
                    where: { email },
                    data: { otp: null, otpExpiration: null }
                });
                return res.status(200).json({
                    message: 'Otp Verified Successfully',
                    status: 200,
                    success: true,
                });
            } else {
                return res.status(400).json({
                    message: 'Invalid or expired OTP',
                    status: 400,
                    success: true
                });
            }
        }
        if (phone_no && otp) {
            console.log(req.body);
            console.log("after");

            const phoneSchema = Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
                otp: Joi.string().required()
            });

            const phoneResult = phoneSchema.validate({ phone_no, otp });
            if (phoneResult.error) {
                const message = phoneResult.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: phoneResult.error.details[0].message,
                    error: message,
                    missingParams: phoneResult.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }


            const user = await prisma.user.findUnique({
                where: { phone_no }
            });
            if (user) {
                const response = await fetch(`${SINCH_BASE_URL}/verifications/number/${encodeURIComponent(phone_no)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Basic ' + Buffer.from(`${SINCH_APPLICATION_KEY}:${SINCH_APPLICATION_SECRET}`).toString('base64')
                    },
                    body: JSON.stringify({
                        method: 'sms',
                        sms: { code: otp }
                    })
                });

                const data = await response.json();
                if (response.ok) {
                    if (data.status === 'FAIL') {
                        return res.status(400).json({ message: `OTP ${data.reason}`, status: 200, success: false });
                    }
                    await prisma.user.update({
                        where: { phone_no },
                        data: { otp: null, otpExpiration: null }
                    });
                    return res.status(200).json({
                        message: 'Otp verified successfully',
                        status: 200,
                        success: true,
                    });
                } else {
                    res.status(response.status).json({ message: `${data.message}`, error: data });
                }
            }
            else {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    message: 'User not found'
                });
            }

        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function resetPassword(req, res, next) {
    try {
        const secretKey = process.env.SECRET_KEY;
        const { email, password, phone_no } = req.body;

        console.log(req.body)

        if (email) {
            const schema = Joi.alternatives(Joi.object({
                email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
                password: Joi.string().min(8).max(64).required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await prisma.user.update({
                where: {
                    email: email
                },
                data: {
                    password: hashedPassword
                }
            })
            // const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
            return res.status(200).json({
                status: 200,
                message: 'Password Reset Successfully,You can now login',
                success: true,
                // token,
                user
            })
        }
        else if (phone_no) {
            const schema = Joi.alternatives(Joi.object({
                phone_no: Joi.string().min(6).max(20).required(),
                password: Joi.string().min(8).max(64).required()
            }))
            const result = schema.validate(req.body);
            if (result.error) {
                const message = result.error.details.map((i) => i.message).join(",");
                return res.status(400).json({
                    message: result.error.details[0].message,
                    error: message,
                    missingParams: result.error.details[0].message,
                    status: 400,
                    success: false,
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await prisma.user.update({
                where: {
                    phone_no: phone_no
                },
                data: {
                    password: hashedPassword
                }
            })
            // const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '3d' });
            return res.status(200).json({
                status: 200,
                message: 'Password Reset Successfully,You can now login',
                success: true,
                // token,
                user
            })
        } else {
            return res.status(400).json({
                status: 400,
                message: 'Email or phone_no is required',
                success: false,
            });
        }



    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function myProfile(req, res) {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            },
            include: {
                UserUpdateRequests: true
            }
        });
        const listedAssets = await prisma.asset.count({
            where: {
                userId: req.user.id,
                promote: {
                    not: 0
                }
            }
        })
        if (user.avatar_url) {
            user.avatar_url = `${baseurl}/images/${user.avatar_url}`
        }
        user.listedAssets = listedAssets;
        return res.status(200).json({
            status: 200,
            message: 'My Profile Data',
            success: true,
            user: user
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function editProfile(req, res) {
    try {
        const { full_name, notes, nameStatus } = req.body;
        const schema = Joi.alternatives(
            Joi.object({
                full_name: Joi.string().optional().allow(null, ''),
                notes: Joi.string().optional().allow(null, ''),
                nameStatus: Joi.number().optional(),
            })
        )
        console.log("body", req.body)
        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.status(400).json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }
        else {
            let userData = {
                full_name: full_name !== undefined ? full_name : req.user.full_name,
                notes: notes !== undefined ? notes : req.user.notes,
                nameStatus: nameStatus != null && nameStatus != undefined ? parseInt(nameStatus) : req.user.nameStatus,
                avatar_url: req.file && req.file.filename ? req.file.filename : req.user.avatar_url
            };
            await prisma.user.update({
                where: {
                    id: req.user.id,
                },
                data: userData
            })
            const updatedUser = await prisma.user.findUnique({
                where: {
                    id: req.user.id
                },
            })
            return res.status(200).json({
                success: true,
                message: "Your profile has been updated successfully",
                status: 200,
                user: updatedUser
            })
        }
    }
    catch (error) {
        console.log(error);
        return res.json({
            success: false,
            message: "Internal server error",
            status: 500,
            error: error
        })
    }
};

// export async function getCategories(req, res) {
//     try {
//         const categories = await prisma.category.findMany({});

//         await Promise.all(categories.map(async (category) => {
//             if (category.categoryImage) {
//                 category.categoryImage = `${baseurl}/images/${category.categoryImage}`
//             }
//             category.count = await prisma.asset.count({
//                 where: {
//                     categoryId: category.id
//                 }
//             })
//         }))

//         return res.status(200).json({
//             status: 200,
//             message: 'Categories',
//             success: true,
//             categories
//         })


//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 200,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }
export async function getCategories(req, res) {
    try {
        const reportedAssetIds = await getReportedAssetIds(req.user.id);
        const [categories, categoryCounts] = await Promise.all([
            prisma.category.findMany({
                orderBy: [
                    { display_order: 'asc' },
                    { id: 'asc' }
                ]
            }),
            prisma.asset.groupBy({
                by: ['categoryId'],
                where: {
                    ...(reportedAssetIds.length > 0 && { id: { notIn: reportedAssetIds } }),
                    userId: {
                        not: req.user.id
                    },
                    blockStatus: 1,
                    isVisible: true
                },
                _count: {
                    _all: true
                }
            })
        ]);

        const categoryCountMap = new Map(
            categoryCounts.map((item) => [item.categoryId, item._count._all])
        );

        const formattedCategories = categories.map((category) => ({
            ...category,
            categoryImage: category.categoryImage ? `${baseurl}/images/${category.categoryImage}` : null,
            count: categoryCountMap.get(category.id) || 0
        }));

        return res.status(200).json({
            status: 200,
            message: 'Categories',
            success: true,
            categories: formattedCategories
        })


    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}


export async function getSubCategories(req, res) {
    try {
        let { id } = req.params;

        id = parseInt(id);
        const sub_categories = await prisma.subCategory.findMany({
            where: {
                categoryId: id
            },
            include: {
                category: true
            }
        });
        return res.status(200).json({
            status: 200,
            message: 'Sub Categories',
            success: true,
            sub_categories
        })


    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export const addAsset = async (req, res) => {
    try {
        const { AssetName, AssetDetails, categoryId, subCategoryId, lock, promote, latitude, longitude, status, AssetIdentifier } = req.body;

        const schema = Joi.object({
            AssetName: Joi.string().required(),
            AssetDetails: Joi.string().required(),
            categoryId: Joi.number().required(),
            subCategoryId: Joi.number().required(),
            lock: Joi.number().required(),
            promote: Joi.number().required(),
            latitude: Joi.string().required(),
            longitude: Joi.string().required(),
            status: Joi.string().required(),
            AssetIdentifier: Joi.string().required()
        });

        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        // Generate a unique UIC number
        let UIC;
        let isUnique = false;

        // Loop to ensure UIC is unique
        while (!isUnique) {
            UIC = await generateRandomUICNumber();
            const uniqueUIC = await prisma.asset.findUnique({
                where: {
                    UIC: UIC
                }
            });
            if (!uniqueUIC) {
                isUnique = true;
            }
        }

        const myPlan = await getActivePlanForUser(req.user.id);
        console.log(">>>", myPlan)
        const myActivePlan = myPlan.myPlan.plan;
        console.log("myactivePlab>>>>>>>", myActivePlan);
        console.log("user prpmoted >>>>>>>>", req.user.promotedAssetCount)
        const currentDate = new Date();
        let expireAt = null;

        if (myActivePlan.id === 1) {

            const assetCount = await prisma.asset.count({
                where: {
                    userId: req.user.id
                }
            })

            if (promote && parseInt(promote) !== 0) {
                return res.status(400).json({
                    status: 400,
                    message: 'Cannot promote assset in free plan. Please upgrade your plan.',
                    success: false,
                })
            }

            if (req.user.promotedAssetCount >= 2) {
                return res.status(400).json({
                    status: 400,
                    message: 'You cannot list more than 2 asset in free plan,please upgrade your plan ',
                    success: false,
                })
            }
            // if (parseInt(promote) !== 0 && req.user.promotedAssetCount === 2) {
            //     return res.status(400).json({
            //         status: 400,
            //         message: 'You can only promote up to two assets on the Free plan. Please upgrade your plan.',
            //         success: false,
            //     })
            // }

            expireAt = new Date(currentDate.setDate(currentDate.getDate())).toISOString().split('T')[0];
            const asset = await prisma.asset.create({
                data: {
                    AssetName: AssetName,
                    AssetDetails: AssetDetails,
                    AssetIdentifier: AssetIdentifier,
                    UIC: UIC,  // Set the UIC here
                    categoryId: parseInt(categoryId),
                    subCategoryId: parseInt(subCategoryId),
                    status: status,
                    lock: parseInt(lock),
                    promote: parseInt(promote),
                    latitude: latitude,
                    longitude: longitude,
                    userId: req.user.id,
                    expireAt: expireAt
                }
            });


            for (let i = 0; i < req.files.length; i++) {
                await prisma.assetImages.create({
                    data: {
                        assetId: asset.id,
                        image_url: req.files[i].filename
                    }
                });
            }

            await prisma.user.update({
                where: {
                    id: req.user.id
                },
                data: {
                    promotedAssetCount: req.user.promotedAssetCount + 1
                }
            })
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            const mail = await sendNotificationEmail({ to: user.email, subject: "Asset Added", template: "mail_template", context: { title: "Asset Added", message: `Your new listing ‘${AssetName}’ has been added successfully. Keep your asset UIC #${UIC} safe.` }, });


            const admin = await prisma.admin.findMany();
            await Promise.all(admin.map(async (admin) => {
                const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'New Asset Added', content: `New asset added by ${user.full_name}. Asset UIC: #${UIC}. Please review and verify if needed.` });
            }))


            return res.status(200).json({
                status: 200,
                message: `Your asset ‘${AssetName}’ has been listed with UIC #${UIC}`,
                success: true,
            });
        }




        if (parseInt(promote) === 1) {
            expireAt = new Date(currentDate.setDate(currentDate.getDate() + 7)).toISOString().split('T')[0];
        } else if (parseInt(promote) === 2) {
            expireAt = new Date(currentDate.setDate(currentDate.getDate() + 14)).toISOString().split('T')[0];
        } else if (parseInt(promote) === 4) {
            expireAt = new Date(currentDate.setDate(currentDate.getDate() + 28)).toISOString().split('T')[0];
        }
        console.log('>>>>>', expireAt);
        console.log('>>>', myPlan.myPlan.expired_at.toISOString().split('T')[0])
        if (expireAt > myPlan.myPlan.expired_at.toISOString().split('T')[0]) {
            return res.status(400).json({
                status: 400,
                message: 'The promoted asset expiry time exceeds your current plans expiry time. Please upgrade your plan.',
                success: false,
            })
        }

        const asset = await prisma.asset.create({
            data: {
                AssetName: AssetName,
                AssetDetails: AssetDetails,
                AssetIdentifier: AssetIdentifier,
                UIC: UIC,  // Set the UIC here
                categoryId: parseInt(categoryId),
                subCategoryId: parseInt(subCategoryId),
                status: status,
                lock: parseInt(lock),
                promote: parseInt(promote),
                latitude: latitude,
                longitude: longitude,
                userId: req.user.id,
                expireAt: expireAt
            }
        });

        for (let i = 0; i < req.files.length; i++) {
            await prisma.assetImages.create({
                data: {
                    assetId: asset.id,
                    image_url: req.files[i].filename
                }
            });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const mail = await sendNotificationEmail({ to: user.email, subject: "Asset Added", template: "mail_template", context: { title: "Asset Added", message: `Your new listing ‘${AssetName}’ has been added successfully. Keep your asset UIC #${UIC} safe.` }, });


        const admin = await prisma.admin.findMany();
        await Promise.all(admin.map(async (admin) => {
            const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'New Asset Added', content: `New asset added by ${user.full_name}. Asset UIC: #${UIC}. Please review and verify if needed.` });
        }))

        return res.status(200).json({
            status: 200,
            message: `Your asset ‘${AssetName}’ has been listed with UIC #${UIC}`,
            success: true,
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        });
    }
};

export async function getMySingleAsset(req, res) {
    try {
        const { id } = req.params;
        const asset = await prisma.asset.findUnique({
            where: {
                id: parseInt(id),
                userId: req.user.id
            },
            include: {
                AssetImages: true,
                user: true
            }
        })

        for (let i = 0; i < asset.AssetImages.length; i++) {
            asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
        }
        if (asset.user.avatar_url) {
            asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
        }

        return res.status(200).json({
            status: 200,
            message: 'Asset Fetched Successfully',
            success: true,
            asset
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

// export async function getMyAssets(req, res) {
//     try {

//         const { page = 1, limit = 10, search } = req.query;

//         const filterQuery = {
//             userId: req.user.id,
//             ...(search && {
//                 OR: [
//                     { AssetName: { contains: search, } },
//                     { AssetIdentifier: { contains: search, } },
//                     { UIC: { contains: search, } }
//                 ]
//             })
//         };

//         const assets = await prisma.asset.findMany({
//             where: filterQuery,
//             include: {
//                 AssetImages: true,
//                 user: true
//             },
//             orderBy: {
//                 promote: 'desc'
//             },
//             skip: parseInt((page - 1) * limit), take: parseInt(limit)
//         })
//         await Promise.all(assets.map(async (asset) => {
//             if (asset.AssetImages) {
//                 for (let i = 0; i < asset.AssetImages.length; i++) {
//                     asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
//                 }
//             }
//             const checkSaved = await prisma.saveAsset.findFirst({
//                 where: {
//                     assetId: asset.id,
//                     saveByUserId: req.user.id
//                 }
//             })
//             asset.alreadySaved = false;
//             if (checkSaved) {
//                 asset.alreadySaved = true
//             }
//             if (asset.user.avatar_url) {
//                 asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
//             }
//             return asset
//         }))


//           const [categories] = await Promise.all([
//             prisma.category.findMany({
//                 orderBy: {
//                     id: 'desc'
//                 }
//             }),
//               ]);

//         // const categoryCounts = await prisma.asset.groupBy({
//         //     by: ['categoryId'],
//         //     where: categoryCountFilter,
//         //     _count: {
//         //         _all: true
//         //     }
//         // });

//         // const categoryCountMap = new Map(categoryCounts.map((item) => [item.categoryId, item._count._all]));

//         const formattedCategories = categories.map((category) => ({
//             ...category,
//             categoryImage: category.categoryImage ? `${baseurl}/images/${category.categoryImage}` : null,
//             // count: categoryCountMap.get(category.id) || 0
//         }));


//         return res.status(200).json({
//             status: 200,
//             message: 'Assets',
//             success: true,
//             categories: formattedCategories,
//             assets,
//             total: assets.length
//         })
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 200,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }

export async function getMyAssets(req, res) {
    try {
        const { search, categoryId } = req.query;

        const parsedCategoryId = categoryId ? parseInt(categoryId) : null;

        const filterQuery = {
            userId: req.user.id,
            ...(parsedCategoryId && { categoryId: parsedCategoryId }),
            ...(search && {
                OR: [
                    { AssetName: { contains: search } },
                    { AssetIdentifier: { contains: search } },
                    { UIC: { contains: search } }
                ]
            })
        };

        const assets = await prisma.asset.findMany({
            where: filterQuery,
            include: {
                AssetImages: true,
                user: true
            },
            orderBy: {
                promote: "desc"
            }
        });

        await Promise.all(
            assets.map(async (asset) => {
                if (asset.AssetImages) {
                    asset.AssetImages = asset.AssetImages.map((img) => ({
                        ...img,
                        image_url: `${baseurl}/images/${img.image_url}`
                    }));
                }

                const checkSaved = await prisma.saveAsset.findFirst({
                    where: {
                        assetId: asset.id,
                        saveByUserId: req.user.id
                    }
                });

                asset.alreadySaved = !!checkSaved;

                if (asset.user?.avatar_url) {
                    asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`;
                }

                return asset;
            })
        );

        const categories = await prisma.category.findMany({
            orderBy: [
                { display_order: "asc" },
                { id: "asc" }
            ]
        });

        const categoryCounts = await prisma.asset.groupBy({
            by: ["categoryId"],
            where: {
                userId: req.user.id
            },
            _count: {
                _all: true
            }
        });

        const categoryCountMap = new Map(
            categoryCounts.map((item) => [item.categoryId, item._count._all])
        );

        const formattedCategories = categories.map((category) => ({
            ...category,
            categoryImage: category.categoryImage
                ? `${baseurl}/images/${category.categoryImage}`
                : null,
            count: categoryCountMap.get(category.id) || 0
        }));

        return res.status(200).json({
            status: 200,
            message: "Assets",
            success: true,
            categories: formattedCategories,
            assets,
            total: assets.length
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            success: false,
            error: error.message
        });
    }
}

// export async function getAllAssets(req, res) {
//     try {
//         const { categoryId, subCategoryId, search, page = 1, limit = 10 } = req.query;

//         const blockUsers = (await prisma.user.findMany({
//             where: {
//                 status: 0
//             }
//         })).map((user) => user.id)
//         console.log("blockUsers>>>>>", blockUsers)

//         const blockAssets = (await prisma.asset.findMany({
//             where: {
//                 blockStatus: 0
//             }
//         })).map((user) => user.id)
//         console.log("blockUsers>>>>>", blockUsers)

//         console.log(req.query)
//         const reportedAssetIds = await getReportedAssetIds(req.user.id);
//         const reportedUserIds = await getReportedUserIds(req.user.id);
//         const filterQuery = {
//             ...(categoryId && { categoryId: parseInt(categoryId) }),  // Filter by categoryId if present
//             ...(subCategoryId && { subCategoryId: parseInt(subCategoryId) }),  // Filter by subCategoryId if present
//             ...(search && {
//                 OR: [
//                     { AssetName: { contains: search } },  // Case insensitive search in assetName
//                     { AssetIdentifier: { contains: search } },
//                     { UIC: { contains: search } }  // Case insensitive search in assetIdentifier
//                 ]
//             }),
//             ...(reportedAssetIds.length > 0 && { id: { notIn: reportedAssetIds } }),
//             // Exclude assets from users reported by the user
//             ...(reportedUserIds.length > 0 && { userId: { notIn: [...reportedUserIds, req.user.id] } }),
//             ...({
//                 userId: {
//                     notIn: [...blockUsers, req.user.id]
//                 }
//             }),
//             ...(
//                 {
//                     blockStatus: 1
//                 }
//             ),
//             ...({
//                 id: {
//                     notIn: blockAssets
//                 }
//             }),
//         };

//         const assets = await prisma.asset.findMany({
//             where: filterQuery,
//             include: {
//                 AssetImages: true,
//                 user: true
//             },
//             orderBy: {
//                 promote: 'desc'
//             },
//             skip: parseInt((page - 1) * limit), take: parseInt(limit)
//         })

//         await Promise.all(assets.map(async (asset) => {
//             if (asset.AssetImages) {
//                 for (let i = 0; i < asset.AssetImages.length; i++) {
//                     asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
//                 }
//             }
//             const checkSaved = await prisma.saveAsset.findFirst({
//                 where: {
//                     assetId: asset.id,
//                     saveByUserId: req.user.id
//                 }
//             })
//             asset.alreadySaved = false;
//             if (checkSaved) {
//                 asset.alreadySaved = true
//             }
//             if (asset.user.avatar_url) {
//                 asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
//             }
//             return asset
//         }))

//         const count = await prisma.asset.count({
//             where: filterQuery,
//         })

//           const [categories] = await Promise.all([
//             prisma.category.findMany({
//                 orderBy: {
//                     id: 'desc'
//                 }
//             }),
//               ]);

//         // const categoryCounts = await prisma.asset.groupBy({
//         //     by: ['categoryId'],
//         //     where: categoryCountFilter,
//         //     _count: {
//         //         _all: true
//         //     }
//         // });

//         // const categoryCountMap = new Map(categoryCounts.map((item) => [item.categoryId, item._count._all]));

//         const formattedCategories = categories.map((category) => ({
//             ...category,
//             categoryImage: category.categoryImage ? `${baseurl}/images/${category.categoryImage}` : null,
//             // count: categoryCountMap.get(category.id) || 0
//         }));


//         return res.status(200).json({
//             status: 200,
//             message: 'Assets',
//             success: true,
//             categories: formattedCategories,
//             assets,
//             count

//         })
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 200,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }

export async function getAllAssets(req, res) {
    try {
        const { categoryId, subCategoryId, search } = req.query;

        const parsedCategoryId = categoryId ? parseInt(categoryId) : null;
        const parsedSubCategoryId = subCategoryId ? parseInt(subCategoryId) : null;

        const blockUsers = (
            await prisma.user.findMany({
                where: { status: 0 },
                select: { id: true }
            })
        ).map((user) => user.id);

        const blockAssets = (
            await prisma.asset.findMany({
                where: { blockStatus: 0 },
                select: { id: true }
            })
        ).map((asset) => asset.id);

        const reportedAssetIds = await getReportedAssetIds(req?.user?.id ? req.user.id : 0);
        const reportedUserIds = await getReportedUserIds(req?.user?.id ? req.user.id : 0);

        const filterQuery = {
            ...(parsedCategoryId && { categoryId: parsedCategoryId }),
            ...(parsedSubCategoryId && { subCategoryId: parsedSubCategoryId }),

            ...(search && {
                OR: [
                    { AssetName: { contains: search } },
                    { AssetIdentifier: { contains: search } },
                    { UIC: { contains: search } }
                ]
            }),

            blockStatus: 1,

            userId: {
                notIn: [...blockUsers, ...reportedUserIds, req?.user?.id ? req.user.id : 0]
            },

            id: {
                notIn: [...blockAssets, ...reportedAssetIds]
            }
        };

        const assets = await prisma.asset.findMany({
            where: filterQuery,
            include: {
                AssetImages: true,
                user: true
            },
            orderBy: {
                promote: "desc"
            }
        });

        await Promise.all(
            assets.map(async (asset) => {
                if (asset.AssetImages) {
                    asset.AssetImages = asset.AssetImages.map((img) => ({
                        ...img,
                        image_url: `${baseurl}/images/${img.image_url}`
                    }));
                }

                const checkSaved = await prisma.saveAsset.findFirst({
                    where: {
                        assetId: asset.id,
                        saveByUserId: req?.user?.id ? req.user.id : 0
                    }
                });

                asset.alreadySaved = !!checkSaved;

                if (asset.user?.avatar_url) {
                    asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`;
                }

                return asset;
            })
        );

        const categories = await prisma.category.findMany({
            orderBy: [
                { display_order: "asc" },
                { id: "asc" }
            ]
        });

        const categoryCounts = await prisma.asset.groupBy({
            by: ["categoryId"],
            where: {
                blockStatus: 1,
                userId: {
                    notIn: blockUsers
                }
            },
            _count: {
                _all: true
            }
        });

        const categoryCountMap = new Map(
            categoryCounts.map((item) => [item.categoryId, item._count._all])
        );

        const formattedCategories = categories.map((category) => ({
            ...category,
            categoryImage: category.categoryImage
                ? `${baseurl}/images/${category.categoryImage}`
                : null,
            count: categoryCountMap.get(category.id) || 0
        }));

        const categoryOrderMap = new Map(
            categories.map((c) => [c.id, c.display_order ?? 999999])
        );

        assets.sort((a, b) => {
            const orderA = categoryOrderMap.get(a.categoryId) ?? 999999;
            const orderB = categoryOrderMap.get(b.categoryId) ?? 999999;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return (b.promote || 0) - (a.promote || 0) || b.id - a.id;
        });

        return res.status(200).json({
            status: 200,
            message: "Assets",
            success: true,
            categories: formattedCategories,
            assets,
            total: assets.length
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            success: false,
            error: error.message
        });
    }
}

export async function editAsset(req, res) {
    try {
        const { AssetName, AssetDetails, AssetIdentifier, categoryId, subCategoryId, lock, promote, latitude, longitude, status, id } = req.body;
        const schema = Joi.alternatives(
            Joi.object({
                AssetName: Joi.string().optional(),
                AssetDetails: Joi.string().optional(),
                AssetIdentifier: Joi.string().optional(),
                categoryId: Joi.number().optional(),
                subCategoryId: Joi.number().optional(),
                lock: Joi.number().optional(),
                promote: Joi.number().optional(),
                latitude: Joi.string().optional(),
                longitude: Joi.string().optional(),
                status: Joi.string().optional(),
                id: Joi.number().required()
            })
        )
        console.log("body", req.body)
        const result = schema.validate(req.body);

        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }
        const asset = await prisma.asset.findUnique({
            where: {
                id: parseInt(id),
                userId: req.user.id
            }
        })
        if (!asset) {
            return res.status(400).json({
                success: false,
                status: 400,
                message: 'Asset Not Found',
            })
        }
        const myPlan = await getActivePlanForUser(req.user.id);

        console.log("myPlan", myPlan.myPlan.plan);
        const myActivePlan = myPlan.myPlan.plan;
        const currentDate = new Date();
        let expireAt = null;
        if (myActivePlan.id === 1) {
            if (AssetName && AssetName !== asset.AssetName) {
                return res.status(400).json({
                    status: 400,
                    message: 'Asset names cannot be edited on the Free plan. Please upgrade your plan. ',
                    success: false,
                })
            }
            // if (parseInt(promote) !== 0 && req.user.promotedAssetCount === 2) {
            //     return res.status(400).json({
            //         status: 400,
            //         message: 'You can only promote up to two assets on the Free plan. Please upgrade your plan.',
            //         success: false,
            //     })
            // }
            if (promote && parseInt(promote) !== 0) {
                return res.status(400).json({
                    status: 400,
                    message: 'Cannot promote assset in free plan. Please upgrade your plan.',
                    success: false,
                })
            }
            expireAt = new Date(currentDate.setDate(currentDate.getDate())).toISOString().split('T')[0];
            await prisma.asset.update({
                where: {
                    id: parseInt(id)
                }
                , data: {
                    AssetName: AssetName ? AssetName : asset.AssetName,
                    AssetDetails: AssetDetails ? AssetDetails : asset.AssetDetails,
                    AssetIdentifier: AssetIdentifier ? AssetIdentifier : asset.AssetIdentifier,
                    categoryId: categoryId ? parseInt(categoryId) : asset.categoryId,
                    subCategoryId: subCategoryId ? parseInt(subCategoryId) : asset.subCategoryId,
                    status: status ? status : asset.status,
                    lock: lock != null && lock !== undefined ? parseInt(lock) : asset.lock,
                    promote: promote != null && promote !== undefined ? parseInt(promote) : asset.promote,
                    latitude: latitude ? latitude : asset.latitude,
                    longitude: longitude ? longitude : asset.longitude,
                    expireAt: expireAt ? expireAt : asset.expireAt
                }
            })

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const assetImages = await prisma.assetImages.create({
                        data: {
                            assetId: asset.id,
                            image_url: req.files[i].filename
                        }
                    })
                }
            }

            const user = await prisma.user.findUnique({ where: { id: req.user.id } });

            const admin = await prisma.admin.findMany();
            await Promise.all(admin.map(async (admin) => {
                const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Asset Edited', content: `User ${user.full_name} edited listing: ‘${asset.AssetName}’ (UIC #${asset.UIC}).` });
            }))


            return res.status(200).json({
                status: 200,
                message: `Your changes to ‘${AssetName}’ have been saved`,
                success: true,
            });
        }



        if (parseInt(promote) !== 0) {
            if (parseInt(promote) === 1) {
                expireAt = new Date(currentDate.setDate(currentDate.getDate() + 7)).toISOString().split('T')[0];
            } else if (parseInt(promote) === 2) {
                expireAt = new Date(currentDate.setDate(currentDate.getDate() + 14)).toISOString().split('T')[0];
            } else if (parseInt(promote) === 4) {
                expireAt = new Date(currentDate.setDate(currentDate.getDate() + 28)).toISOString().split('T')[0];
            }

            if (expireAt > myPlan.myPlan.expired_at.toISOString().split('T')[0]) {
                return res.status(400).json({
                    status: 400,
                    message: 'The promoted asset expiry time exceeds your current plans expiry time. Please upgrade your plan.',
                    success: false,
                })
            }
            await prisma.asset.update({
                where: {
                    id: parseInt(id)
                }
                , data: {
                    AssetName: AssetName ? AssetName : asset.AssetName,
                    AssetDetails: AssetDetails ? AssetDetails : asset.AssetDetails,
                    AssetIdentifier: AssetIdentifier ? AssetIdentifier : asset.AssetIdentifier,
                    categoryId: categoryId ? parseInt(categoryId) : asset.categoryId,
                    subCategoryId: subCategoryId ? parseInt(subCategoryId) : asset.subCategoryId,
                    status: status ? status : asset.status,
                    lock: lock != null && lock !== undefined ? parseInt(lock) : asset.lock,
                    promote: promote != null && promote !== undefined ? parseInt(promote) : asset.promote,
                    latitude: latitude ? latitude : asset.latitude,
                    longitude: longitude ? longitude : asset.longitude,
                    expireAt: expireAt ? expireAt : asset.expireAt
                }
            })

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const assetImages = await prisma.assetImages.create({
                        data: {
                            assetId: asset.id,
                            image_url: req.files[i].filename
                        }
                    })
                }
            }

            const user = await prisma.user.findUnique({ where: { id: req.user.id } });

            const admin = await prisma.admin.findMany();
            await Promise.all(admin.map(async (admin) => {
                const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Asset Edited', content: `User ${user.full_name} edited listing: ‘${asset.AssetName}’ (UIC #${asset.UIC}).` });
            }))
            return res.status(200).json({
                status: 200,
                message: `Your changes to ‘${asset.AssetName}’ have been saved`,
                success: true,
            });
        }


        await prisma.asset.update({
            where: {
                id: parseInt(id)
            }
            , data: {
                AssetName: AssetName ? AssetName : asset.AssetName,
                AssetDetails: AssetDetails ? AssetDetails : asset.AssetDetails,
                AssetIdentifier: AssetIdentifier ? AssetIdentifier : asset.AssetIdentifier,
                categoryId: categoryId ? parseInt(categoryId) : asset.categoryId,
                subCategoryId: subCategoryId ? parseInt(subCategoryId) : asset.subCategoryId,
                status: status ? status : asset.status,
                lock: lock != null && lock !== undefined ? parseInt(lock) : asset.lock,
                promote: promote != null && promote !== undefined ? parseInt(promote) : asset.promote,
                latitude: latitude ? latitude : asset.latitude,
                longitude: longitude ? longitude : asset.longitude,
                expireAt: expireAt ? expireAt : asset.expireAt
            }
        })

        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const assetImages = await prisma.assetImages.create({
                    data: {
                        assetId: asset.id,
                        image_url: req.files[i].filename
                    }
                })
            }
        }

        return res.status(200).json({
            status: 200,
            message: 'Asset Updated successfully',
            success: true,
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })


    }
}

export async function deleteAssetImage(req, res) {
    try {

        let { id } = req.params;

        id = parseInt(id);

        await prisma.assetImages.delete({
            where: {
                id: id
            }
        })
        return res.status(200).json({
            status: 200,
            message: 'Image Deleted Succesfully',
            success: true,
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

// export async function homePage(req, res) {
//     try {
//         const { search } = req.query
//         const categories = await prisma.category.findMany({
//             // include:{
//             //     Asset:true
//             // },
//             take: 3
//         });

//         await Promise.all(categories.map(async (category) => {
//             if (category.categoryImage) {
//                 category.categoryImage = `${baseurl}/images/${category.categoryImage}`
//             }
//             category.count = await prisma.asset.count({
//                 where: {
//                     userId:{
//                         not:req.user.id
//                     },
//                     categoryId: category.id
//                 }
//             })
//         }))

//         const filterQuery = {
//             userId: {
//                 not: req.user.id
//             },
//             ...(search && {
//                 OR: [
//                     { AssetName: { contains: search, } },
//                     { AssetIdentifier: { contains: search, } },
//                     { UIC: { contains: search, } }
//                 ]
//             })
//         };

//         const assets = await prisma.asset.findMany({
//             where: filterQuery,
//             include: {
//                 AssetImages: true,
//                 user: true
//             },
//             orderBy: {
//                 promote: 'desc'
//             },
//             take: 4
//         })

//         await Promise.all(assets.map((asset) => {
//             if (asset.AssetImages) {
//                 for (let i = 0; i < asset.AssetImages.length; i++) {
//                     asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
//                 }
//             }
//             if (asset.user.avatar_url) {
//                 asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
//             }
//             return asset
//         }))

//         return res.status(200).json({
//             status: 200,
//             message: 'Home Page Fetche',
//             success: true,
//             categories,
//             assets

//         })

//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }
export async function homePage(req, res) {
    try {
        const { search } = req.query
        const categories = await prisma.category.findMany({
            orderBy: [
                { display_order: 'asc' },
                { id: 'asc' }
            ]
        });
        const reportedAssetIds = await getReportedAssetIds(req.user.id);

        await Promise.all(categories.map(async (category) => {
            if (category.categoryImage) {
                category.categoryImage = `${baseurl}/images/${category.categoryImage}`
            }
            const categoryFilterQuery = {
                ...(reportedAssetIds.length > 0 && { id: { notIn: reportedAssetIds } }),
                categoryId: category.id,
                userId: {
                    not: req.user.id
                }
            };
            category.count = await prisma.asset.count({
                where: categoryFilterQuery
            })
        }))

        const filterQuery = {
            userId: {
                not: req.user.id
            },
            ...(search && {
                OR: [
                    { AssetName: { contains: search, } },
                    { AssetIdentifier: { contains: search, } },
                    { UIC: { contains: search, } }
                ]
            }),
            ...(
                {
                    blockStatus: 1
                }
            ),
        };

        const assets = await prisma.asset.findMany({
            where: filterQuery,
            include: {
                AssetImages: true,
                user: true
            },
            orderBy: {
                promote: 'desc'
            },
            take: 4
        })

        await Promise.all(assets.map((asset) => {
            if (asset.AssetImages) {
                for (let i = 0; i < asset.AssetImages.length; i++) {
                    asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
                }
            }
            if (asset.user.avatar_url) {
                asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
            }
            return asset
        }))

        return res.status(200).json({
            status: 200,
            message: 'Home Page Fetche',
            success: true,
            categories,
            assets

        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function publicHomePage(req, res) {
    try {
        const { search, categoryId, page = 1, limit = 8, featuredLimit = 4 } = req.query;

        const parsedPage = Number.parseInt(page, 10);
        const parsedLimit = Number.parseInt(limit, 10);
        const parsedFeaturedLimit = Number.parseInt(featuredLimit, 10);
        const parsedCategoryId = categoryId ? Number.parseInt(categoryId, 10) : null;

        if (categoryId && Number.isNaN(parsedCategoryId)) {
            return res.status(400).json({
                status: 400,
                message: 'Invalid categoryId',
                success: false,
            });
        }

        const safePage = !Number.isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;
        const safeLimit = !Number.isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 8;
        const safeFeaturedLimit = !Number.isNaN(parsedFeaturedLimit) && parsedFeaturedLimit > 0 ? parsedFeaturedLimit : 4;

        const blockedUsers = await prisma.user.findMany({
            where: {
                status: 0
            },
            select: {
                id: true
            }
        });
        const blockedUserIds = blockedUsers.map((user) => user.id);

        const categories = await prisma.category.findMany({
            orderBy: [
                { display_order: 'asc' },
                { id: 'asc' }
            ]
        });

        const validCategoryIds = categories.map((category) => category.id);

        if (parsedCategoryId !== null && !validCategoryIds.includes(parsedCategoryId)) {
            return res.status(400).json({
                status: 400,
                message: 'Invalid categoryId',
                success: false,
            });
        }

        const baseAssetVisibilityFilter = {
            blockStatus: 1,
            ...(blockedUserIds.length > 0 && {
                userId: {
                    notIn: blockedUserIds,
                },
            }),
        };

        const assetFilterQuery = {
            ...baseAssetVisibilityFilter,
            ...(parsedCategoryId !== null
                ? { categoryId: parsedCategoryId }
                : (validCategoryIds.length > 0 ? { categoryId: { in: validCategoryIds } } : {})),
            ...(search && {
                OR: [
                    { AssetName: { contains: search } },
                    { AssetIdentifier: { contains: search } },
                    { UIC: { contains: search } }
                ]
            }),
        };

        const categoryCountFilter = {
            ...baseAssetVisibilityFilter,
            ...(validCategoryIds.length > 0 ? { categoryId: { in: validCategoryIds } } : {}),
        };

        // NOTE: We intentionally do not `include` required relations like `subCategory` here.
        // If the database contains inconsistent rows (dangling foreign keys), Prisma can throw
        // "Inconsistent query result" when including required relations.
        const assetIncludeSafe = {
            AssetImages: true,
            user: {
                select: {
                    id: true,
                    full_name: true,
                    avatar_url: true
                }
            }
        };

        const [featuredAssets, assets, total] = await Promise.all([
            prisma.asset.findMany({
                where: {
                    ...assetFilterQuery,
                    promote: {
                        gt: 0
                    }
                },
                include: assetIncludeSafe,
                orderBy: [
                    {
                        promote: 'desc'
                    },
                    {
                        createdAt: 'desc'
                    }
                ],
                take: safeFeaturedLimit
            }),
            prisma.asset.findMany({
                where: assetFilterQuery,
                include: assetIncludeSafe,
                orderBy: [
                    {
                        promote: 'desc'
                    },
                    {
                        createdAt: 'desc'
                    }
                ],
                skip: (safePage - 1) * safeLimit,
                take: safeLimit
            }),
            prisma.asset.count({
                where: assetFilterQuery
            }),
        ]);

        const effectiveFeaturedAssets = featuredAssets.length > 0
            ? featuredAssets
            : await prisma.asset.findMany({
                where: assetFilterQuery,
                include: assetIncludeSafe,
                orderBy: [
                    {
                        createdAt: 'desc'
                    }
                ],
                take: safeFeaturedLimit
            });

        const allCategoryIdsForAssets = Array.from(new Set(
            [...assets, ...effectiveFeaturedAssets]
                .map((asset) => asset.categoryId)
                .filter((id) => typeof id === 'number')
        ));

        const allSubCategoryIdsForAssets = Array.from(new Set(
            [...assets, ...effectiveFeaturedAssets]
                .map((asset) => asset.subCategoryId)
                .filter((id) => typeof id === 'number')
        ));

        const [assetCategories, assetSubCategories] = await Promise.all([
            allCategoryIdsForAssets.length > 0
                ? prisma.category.findMany({ where: { id: { in: allCategoryIdsForAssets } } })
                : Promise.resolve([]),
            allSubCategoryIdsForAssets.length > 0
                ? prisma.subCategory.findMany({ where: { id: { in: allSubCategoryIdsForAssets } } })
                : Promise.resolve([]),
        ]);

        const assetCategoryMap = new Map(assetCategories.map((category) => [category.id, category]));
        const assetSubCategoryMap = new Map(assetSubCategories.map((subCategory) => [subCategory.id, subCategory]));

        const categoryCounts = await prisma.asset.groupBy({
            by: ['categoryId'],
            where: categoryCountFilter,
            _count: {
                _all: true
            }
        });

        const categoryCountMap = new Map(categoryCounts.map((item) => [item.categoryId, item._count._all]));

        const formattedCategories = categories.map((category) => ({
            ...category,
            categoryImage: category.categoryImage ? `${baseurl}/images/${category.categoryImage}` : null,
            count: categoryCountMap.get(category.id) || 0
        }));

        const formatAssetData = (assetData) => {
            if (assetData.AssetImages) {
                assetData.AssetImages = assetData.AssetImages.map((image) => ({
                    ...image,
                    image_url: image.image_url ? `${baseurl}/images/${image.image_url}` : null
                }));
            }

            if (assetData.user?.avatar_url) {
                assetData.user.avatar_url = `${baseurl}/images/${assetData.user.avatar_url}`;
            }

            return {
                ...assetData,
                category: assetCategoryMap.get(assetData.categoryId) || null,
                subCategory: assetSubCategoryMap.get(assetData.subCategoryId) || null,
                isFeatured: assetData.promote > 0
            };
        };

        const formattedAssets = assets.map(formatAssetData);
        let formattedFeaturedAssets = effectiveFeaturedAssets.map(formatAssetData);

        // Extra fallback: if there are no promoted assets and the "latest assets" query is empty,
        // show a featured slice from the current page results when available.
        if (formattedFeaturedAssets.length === 0 && formattedAssets.length > 0) {
            formattedFeaturedAssets = formattedAssets.slice(0, safeFeaturedLimit);
        }

        return res.status(200).json({
            status: 200,
            message: 'Public home data fetched successfully',
            success: true,
            categories: formattedCategories,
            featuredAssets: formattedFeaturedAssets,
            assets: formattedAssets,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total,
                totalPages: Math.ceil(total / safeLimit)
            }
        });
    } catch (error) {
        console.log(error);

        if (error.message?.includes('Inconsistent query result')) {
            return res.status(200).json({
                status: 200,
                message: 'Data not found',
                success: false,
            });
        }

        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message,
        });

    }
}

// export async function publicAssetDetails(req, res) {
//     try {
//         const { id } = req.params;
//         const { relatedLimit = 4 } = req.query;

//         const parsedId = Number.parseInt(id, 10);
//         const parsedRelatedLimit = Number.parseInt(relatedLimit, 10);
//         const safeRelatedLimit = !Number.isNaN(parsedRelatedLimit) && parsedRelatedLimit > 0 ? parsedRelatedLimit : 4;

//         if (Number.isNaN(parsedId)) {
//             return res.status(400).json({
//                 status: 400,
//                 message: 'Invalid asset id',
//                 success: false,
//             });
//         }

//         const blockedUsers = await prisma.user.findMany({
//             where: {
//                 status: 0
//             },
//             select: {
//                 id: true
//             }
//         });
//         const blockedUserIds = blockedUsers.map((user) => user.id);

//         const formatAssetData = (assetData) => {
//             if (assetData.AssetImages) {
//                 assetData.AssetImages = assetData.AssetImages.map((image) => ({
//                     ...image,
//                     image_url: image.image_url ? `${baseurl}/images/${image.image_url}` : null
//                 }));
//             }

//             if (assetData.user?.avatar_url) {
//                 assetData.user.avatar_url = `${baseurl}/images/${assetData.user.avatar_url}`;
//             }

//             return {
//                 ...assetData,
//                 isFeatured: assetData.promote > 0
//             };
//         };

//         const asset = await prisma.asset.findFirst({
//             where: {
//                 id: parsedId,
//                 blockStatus: 1,
//                 // isVisible: true,
//                 ...(blockedUserIds.length > 0 && {
//                     userId: {
//                         notIn: blockedUserIds
//                     }
//                 }),
//             },
//             include: {
//                 AssetImages: true,
//                 category: true,
//                 subCategory: true,
//                 user: {
//                     select: {
//                         id: true,
//                         full_name: true,
//                         avatar_url: true
//                     }
//                 }
//             }
//         });

//         if (!asset) {
//             return res.status(404).json({
//                 status: 404,
//                 message: 'Asset not found',
//                 success: false
//             });
//         }

//         const relatedAssets = await prisma.asset.findMany({
//             where: {
//                 id: {
//                     not: parsedId
//                 },
//                 blockStatus: 1,
//                 isVisible: true,
//                 OR: [
//                     { categoryId: asset.categoryId },
//                     { subCategoryId: asset.subCategoryId }
//                 ],
//                 ...(blockedUserIds.length > 0 && {
//                     userId: {
//                         notIn: blockedUserIds
//                     }
//                 }),
//             },
//             include: {
//                 AssetImages: true,
//                 category: true,
//                 subCategory: true,
//                 user: {
//                     select: {
//                         id: true,
//                         full_name: true,
//                         avatar_url: true
//                     }
//                 }
//             },
//             orderBy: [
//                 {
//                     promote: 'desc'
//                 },
//                 {
//                     createdAt: 'desc'
//                 }
//             ],
//             take: safeRelatedLimit
//         });

//         return res.status(200).json({
//             status: 200,
//             message: 'Public asset details fetched successfully',
//             success: true,
//             asset: formatAssetData(asset),
//             relatedAssets: relatedAssets.map(formatAssetData)
//         });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error',
//             success: false,
//             error: error.message,
//         });
//     }
// }

export async function publicAssetDetails(req, res) {
    try {

        const { id } = req.params;
        const { relatedLimit = 4 } = req.query;

        const parsedId = parseInt(id, 10);
        const parsedRelatedLimit = parseInt(relatedLimit, 10);

        const safeRelatedLimit =
            !isNaN(parsedRelatedLimit) && parsedRelatedLimit > 0
                ? parsedRelatedLimit
                : 4;

        if (isNaN(parsedId)) {
            return res.status(400).json({
                status: 400,
                success: false,
                message: "Invalid asset id"
            });
        }

        // blocked users
        const blockedUsers = await prisma.user.findMany({
            where: {
                status: 0
            },
            select: {
                id: true
            }
        });

        const blockedUserIds = blockedUsers.map(user => user.id);

        // MAIN ASSET
        const asset = await prisma.asset.findFirst({
            where: {
                id: parsedId,
                blockStatus: 1,

                ...(blockedUserIds.length > 0 && {
                    userId: {
                        notIn: blockedUserIds
                    }
                })
            },

            include: {
                AssetImages: true,

                user: {
                    select: {
                        id: true,
                        full_name: true,
                        avatar_url: true
                    }
                }
            }
        });

        if (!asset) {
            return res.status(404).json({
                status: 404,
                success: false,
                message: "Asset not found"
            });
        }

        // CATEGORY FETCH SAFE
        let category = null;

        if (asset.categoryId) {
            category = await prisma.category.findFirst({
                where: {
                    id: asset.categoryId
                }
            });
        }

        // SUB CATEGORY FETCH SAFE
        let subCategory = null;

        if (asset.subCategoryId) {

            try {

                subCategory = await prisma.subCategory.findFirst({
                    where: {
                        id: asset.subCategoryId
                    }
                });

            } catch (err) {

                console.log("SubCategory Error =>", err);

                subCategory = null;
            }
        }

        // RELATED ASSETS
        let relatedAssets = [];

        try {

            relatedAssets = await prisma.asset.findMany({

                where: {

                    id: {
                        not: parsedId
                    },

                    blockStatus: 1,

                    isVisible: true,

                    OR: [
                        {
                            categoryId: asset.categoryId
                        },
                        {
                            subCategoryId: asset.subCategoryId
                        }
                    ],

                    ...(blockedUserIds.length > 0 && {
                        userId: {
                            notIn: blockedUserIds
                        }
                    })
                },

                include: {

                    AssetImages: true,

                    user: {
                        select: {
                            id: true,
                            full_name: true,
                            avatar_url: true
                        }
                    }
                },

                orderBy: [
                    {
                        promote: "desc"
                    },
                    {
                        createdAt: "desc"
                    }
                ],

                take: safeRelatedLimit
            });

        } catch (relatedErr) {

            console.log("Related Assets Error =>", relatedErr);

            relatedAssets = [];
        }

        // FORMAT FUNCTION
        const formatAsset = async (item) => {

            let itemCategory = null;
            let itemSubCategory = null;

            // category
            if (item.categoryId) {

                itemCategory = await prisma.category.findFirst({
                    where: {
                        id: item.categoryId
                    }
                });
            }

            // sub category
            if (item.subCategoryId) {

                try {

                    itemSubCategory = await prisma.subCategory.findFirst({
                        where: {
                            id: item.subCategoryId
                        }
                    });

                } catch (err) {

                    itemSubCategory = null;
                }
            }

            return {

                ...item,

                category: itemCategory || null,

                subCategory: itemSubCategory || null,

                AssetImages: item.AssetImages.map((img) => ({
                    ...img,
                    image_url: img.image_url
                        ? `${baseurl}/images/${img.image_url}`
                        : null
                })),

                user: item.user
                    ? {
                        ...item.user,
                        avatar_url: item.user.avatar_url
                            ? `${baseurl}/images/${item.user.avatar_url}`
                            : null
                    }
                    : null,

                isFeatured: item.promote > 0
            };
        };

        // FINAL RESPONSE
        return res.status(200).json({
            status: 200,
            success: true,
            message: "Public asset details fetched successfully",

            asset: await formatAsset({
                ...asset,
                category,
                subCategory
            }),

            relatedAssets: await Promise.all(
                relatedAssets.map(formatAsset)
            )
        });

    } catch (error) {

        console.log("Public Asset Error =>", error);

        return res.status(500).json({
            status: 500,
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
}

export async function getSingleAsset(req, res) {
    try {
        const { id } = req.params;
        const asset = await prisma.asset.findUnique({
            where: {
                id: parseInt(id),
            },
            include: {
                AssetImages: true,
                user: true
            }
        })
        const checkSaved = await prisma.saveAsset.findFirst({
            where: {
                assetId: asset.id,
                saveByUserId: req.user.id
            }
        })
        let alreadySaved = false;
        if (checkSaved) {
            alreadySaved = true
        }
        for (let i = 0; i < asset.AssetImages.length; i++) {
            asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
        }

        if (asset.user.avatar_url) {
            asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
        }

        return res.status(200).json({
            status: 200,
            message: 'Asset Fetched Successfully',
            success: true,
            asset: { ...asset, alreadySaved }
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

// export async function getUserById(req, res) {
//     try {
//         let { id } = req.params;
//         id = parseInt(id);
//         const user = await prisma.user.findUnique({
//             where: {
//                 id: id
//             },
//             include: {
//                 Asset: {
//                     include: {
//                         AssetImages: true
//                     }
//                 }
//             }
//         })
//         const listedAssets = await prisma.asset.count({
//             where:{
//                 userId:id,
//                 promote: {
//                     not: 0
//                   }
//             }
//         })
//         user.listedAssets = listedAssets;
//         if (user.avatar_url) {
//             user.avatar_url = `${baseurl}/images/${user.avatar_url}`
//         }
//         user.Asset.map((asset) => {
//             if (asset.AssetImages) {
//                 for (let i = 0; i < asset.AssetImages.length; i++) {
//                     asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
//                 }
//             }
//         })
//         return res.status(200).json({
//             status: 200,
//             message: 'User Details',
//             success: true,
//             user
//         })

//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }

export async function getUserById(req, res) {
    try {
        let { id } = req.params;
        let { search } = req.query; // Get the search query parameter
        id = parseInt(id);

        const filterQuery = {
            ...(search && {
                OR: [
                    { AssetName: { contains: search } },
                    { AssetIdentifier: { contains: search } },
                    { UIC: { contains: search } }
                ]
            })
        };

        const user = await prisma.user.findUnique({
            where: { id: id },
            include: {
                Asset: {
                    where: filterQuery, // Apply the filter query to assets
                    include: {
                        AssetImages: true,
                        user: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'User not found',
                success: false
            });
        }

        const listedAssets = await prisma.asset.count({
            where: {
                userId: id,
                promote: { not: 0 }
            }
        });

        user.listedAssets = listedAssets;

        // Update avatar_url with the base URL
        if (user.avatar_url) {
            user.avatar_url = `${baseurl}/images/${user.avatar_url}`;
        }

        // Update asset images with the base URL
        user.Asset.forEach(asset => {
            asset.AssetImages.forEach(image => {
                image.image_url = `${baseurl}/images/${image.image_url}`;
            });

            if (asset.user.avatar_url) {
                asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
            }
        });

        return res.status(200).json({
            status: 200,
            message: 'User Details',
            success: true,
            user
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        });
    }
}

export async function saveOrUnSaveAsset(req, res) {
    try {
        let { id } = req.params;

        id = parseInt(id);

        const asset = await prisma.asset.findUnique({
            where: {
                id: id
            }
        })

        if (!asset) {
            return res.status(400).json({
                success: false,
                status: 400,
                message: 'Asset Not Found',
            })
        }
        const saveAsset = await prisma.saveAsset.findFirst({
            where: {
                assetId: id,
                saveByUserId: req.user.id
            }
        })

        if (saveAsset) {

            await prisma.saveAsset.delete({
                where: {
                    id: saveAsset.id,
                    saveByUserId: req.user.id,
                    assetId: id
                }
            })

            return res.status(200).json({
                status: 200,
                message: 'UnSaved the asset',
                success: true
            })
        }
        else {

            const saveAsset = await prisma.saveAsset.create({
                data: {
                    assetId: id,
                    saveByUserId: req.user.id,
                }
            })
            return res.status(200).json({
                status: 200,
                message: 'Saved the asset',
                success: true,
                saveAsset: saveAsset
            })

        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })
    }
}

export async function getMySavedAssets(req, res) {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const mySavedAssets = await prisma.saveAsset.findMany({
            where: {
                saveByUserId: req.user.id
            }
        })

        const assetIds = mySavedAssets.map((asset) => asset.assetId)

        console.log('assetIDs', assetIds)

        const filterQuery = {
            id: {
                in: assetIds
            },
            ...(search && {
                OR: [
                    { AssetName: { contains: search, } },
                    { AssetIdentifier: { contains: search, } },
                    { UIC: { contains: search, } }
                ]
            })
        };

        const assets = await prisma.asset.findMany({
            where: filterQuery,
            include: {
                AssetImages: true,
                user: true
            },
            orderBy: {
                promote: 'desc'
            },
            // skip: parseInt((page - 1) * limit), take: parseInt(limit)
        })
        console.log(assets)

        await Promise.all(assets.map(async (asset) => {
            if (asset.AssetImages) {
                for (let i = 0; i < asset.AssetImages.length; i++) {
                    asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
                }
            }
            const checkSaved = await prisma.saveAsset.findFirst({
                where: {
                    assetId: asset.id,
                    saveByUserId: req.user.id
                }
            })
            asset.alreadySaved = false;
            if (checkSaved) {
                asset.alreadySaved = true
            }
            if (asset.user.avatar_url) {
                asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
            }
            return asset
        }))

        return res.status(200).json({
            status: 200,
            message: 'My Saved Assets',
            success: true,
            assets,
            count: assets.length
        })


    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function getPlans(req, res) {
    try {
        const plans = await prisma.plan.findMany({

        });

        const myPlan = await prisma.userSubscription.findFirst({
            where: {
                userId: req?.user?.id,
                sub_status: 1
            },
            include: {
                plan: true
            }
        });
        return res.status(200).json({
            status: 200,
            message: 'Get All Plans',
            success: true,
            plans,
            myPlan
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function purchasePlan(req, res) {
    try {
        let { planId } = req.params;
        planId = parseInt(planId);

        // Fetch the plan details to determine the plan days
        const plan = await prisma.plan.findUnique({
            where: { id: planId }
        });

        if (!plan) {
            return res.status(404).json({
                status: 404,
                message: 'Plan not found',
                success: false,
            });
        }

        // Check if the user has an active subscription
        const activeSubscription = await prisma.userSubscription.findFirst({
            where: {
                userId: req.user.id,
                expired_at: {
                    gte: new Date()
                },
                sub_status: 1
            }
        });

        if (activeSubscription) {
            return res.status(400).json({
                status: 400,
                message: 'Cannot purchase a new plan while an active plan exists.',
                success: false
            });
        }

        // Update sub_status of expired subscriptions
        await prisma.userSubscription.updateMany({
            where: {
                userId: req.user.id,
                expired_at: {
                    lt: new Date()
                },
                sub_status: 1
            },
            data: {
                sub_status: 0
            }
        });

        // Create a new subscription
        const startDate = new Date();
        const expiredAt = new Date(startDate);
        expiredAt.setMonth(startDate.getMonth() + plan.plan_days);

        const newSubscription = await prisma.userSubscription.create({
            data: {
                planId: planId,
                userId: req.user.id,
                start_date: startDate,
                expired_at: expiredAt,
                sub_status: 1,  // Active status
                overlap_status: 0,  // Default value
                refund_status: 0,  // Default value
                overlap_date: expiredAt,  // Assuming overlap date is the same as expiry date
            }
        });

        await prisma.user.update({
            where: { id: req.user.id },
            data: { promotedAssetCount: 0 }
        });

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const mail = await sendNotificationEmail({ to: user.email, subject: "Plan Activated", template: "mail_template", context: { title: "Asset Added", message: `Welcome to ${plan.plan_name} Plan. Your subscription is now active.` }, });

        const admin = await prisma.admin.findMany();
        await Promise.all(admin.map(async (admin) => {
            const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Plan Purchased', content: `User ${user.full_name} has upgraded to ${plan.plan_name} Plan.` });
        }))

        return res.status(200).json({
            status: 200,
            message: `Your ${plan.plan_name} plan is now active. Enjoy your new features!`,
            success: true,
            data: newSubscription
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        });
    }
}

export async function getMyActivePlans(req, res) {
    try {
        const today = new Date();

        // Fetch the active plan
        const myPlan = await prisma.userSubscription.findFirst({
            where: {
                userId: req.user.id,
                // expired_at: {
                //     gte: today
                // },
                sub_status: 1 // Ensure it is an active subscription
            },
            include: {
                plan: true
            }
        });

        if (myPlan) {
            return res.status(200).json({
                status: 200,
                message: 'My Active Plan',
                success: true,
                myPlan
            });
        } else {
            // Create a default free plan on the fly
            const freePlan = await prisma.plan.findFirst({
                where: {
                    plan_name: "Free"  // Adjust this condition as per your actual free plan identifier
                }
            });

            if (!freePlan) {
                return res.status(404).json({
                    status: 404,
                    message: 'Default free plan not found',
                    success: false,
                });
            }

            const startDate = new Date();
            const expiredAt = new Date(); // Free plan expires the same day

            const defaultPlan = {
                id: 0, // Indicates it's a default plan not from DB
                planId: freePlan.id,
                userId: req.user.id,
                created_at: startDate,
                expired_at: expiredAt,
                sub_status: 1, // Assuming active status
                start_date: startDate,
                overlap_status: 0, // Default value
                refund_status: 0, // Default value
                overlap_date: expiredAt,
                plan: freePlan
            };

            return res.status(200).json({
                status: 200,
                message: 'My Active Plan',
                success: true,
                myPlan: defaultPlan
            });
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        });
    }
}

export async function deleteAsset(req, res) {
    try {
        let { id } = req.params;

        id = parseInt(id);

        const asset = await prisma.asset.findUnique({
            where: {
                id: id,
                userId: req.user.id
            }
        })

        if (!asset) {
            return res.status(400).json({
                status: 400,
                message: 'Asset not found ',
                success: true,
            })
        }

        await prisma.asset.delete({
            where: {
                id: id,
                userId: req.user.id
            }
        })
        return res.status(200).json({
            status: 200,
            message: 'Deleted The Asset Successfully ',
            success: true,
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function reportProfile(req, res) {
    try {

        let { userId, reason } = req.body;
        const schema = Joi.alternatives(
            Joi.object({
                reason: Joi.string().optional(),
                userId: Joi.number().required(),
            })
        )
        console.log("body", req.body)
        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        userId = parseInt(userId);

        const myPlan = await getActivePlanForUser(req.user.id);
        const myActivePlan = myPlan.myPlan.plan;

        const user = await prisma.user.findUnique({
            where: {
                id: parseInt(userId)
            }
        })

        if (!user) {
            return res.status(400).json({
                status: 200,
                message: 'User Not Found',
                success: true,
            })
        }

        const alreadyReported = await prisma.reportUser.findFirst({
            where: {
                reportedByUserId: req.user.id,
                reportedToUserId: parseInt(userId)
            }
        })
        if (alreadyReported) {
            return res.status(400).json({
                status: 400,
                message: 'Profile Already Reported',
                success: false,
            })
        }

        const report = await prisma.reportUser.create({
            data: {
                reportedByUserId: req.user.id,
                reportedToUserId: parseInt(userId),
                reason: reason
            }
        })

        const mail = await sendNotificationEmail({ to: user.email, subject: "Profile Reported", template: "mail_template", context: { title: "Profile Reported", message: "We’ve received a report regarding your profile. Our team will review it in line with our guidelines.." }, });

        const notification = await sendNotification({ toUserId: user.id, title: "Profile Reported", content: "Your profile has been reported and is under review." });

        const admin = await prisma.admin.findMany();
        await Promise.all(admin.map(async (admin) => {
            const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Profile Reported', content: `Profile ${user.full_name} has been flagged by User ${req.user.full_name}. Review required.`, token: user.fcm_token, data: JSON.stringify({ userId: req.user.id }) });
        }))
        const mynotification = await prisma.user.findUnique({
            where: {
                id: req.user.id
            }
        })

        const mymail = await sendNotificationEmail({ to: mynotification.email, subject: "Profile Reported", template: "mail_template", context: { title: "Profile Reported", message: "Thanks for letting us know about a profile concern. Our team will review it" }, data: JSON.stringify({ userId: userId }) });


        return res.status(200).json({
            status: 200,
            message: "Your report has been received. We’ll look into this profile",
            success: true,
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function reportAsset(req, res) {
    try {
        let { assetId, reason } = req.body;
        const schema = Joi.alternatives(
            Joi.object({
                reason: Joi.string().optional(),
                assetId: Joi.number().required(),
            })
        )
        console.log("body", req.body)
        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        assetId = parseInt(assetId);

        const myPlan = await getActivePlanForUser(req.user.id);
        const myActivePlan = myPlan.myPlan.plan;

        const asset = await prisma.asset.findUnique({
            where: {
                id: assetId
            }
        })

        if (!asset) {
            return res.status(400).json({
                status: 400,
                message: 'Asset Not Found',
                success: true,
            })
        }

        if (!myActivePlan.reportAsset) {
            return res.status(400).json({
                status: 400,
                message: 'You are not allowed to report assets on the Free plan. Please upgrade your plan.',
                success: true,
            })
        }
        const alreadyReported = await prisma.reportAsset.findFirst({
            where: {
                assetId: assetId,
                reportedBy: req.user.id
            }
        })
        if (alreadyReported) {
            return res.status(400).json({
                status: 400,
                message: 'Asset Already Reported',
                success: false,
            })
        }
        await prisma.reportAsset.create({
            data: {
                assetId: assetId,
                reportedBy: req.user.id,
                reason: reason
            }
        })

        if (asset.reviewStatus === null) {
            await prisma.asset.update({
                where: {
                    id: asset.id
                },
                data: {
                    reviewStatus: 0
                }
            })
        }

        const user = await prisma.user.findUnique({ where: { id: asset.userId } });
        const mail = await sendNotificationEmail({ to: user.email, subject: "Asset Reported", template: "mail_template", context: { title: "Asset Reported", message: `We’ve received a report regarding your listing ‘${asset.AssetName}’. Our team will review it in line with our guidelines.` }, });

        const notification = await sendNotification({ toUserIds: user.id, title: 'Asset Reported', content: `Your asset ‘${asset.AssetName}’ has been reported and is under review.`, sendFCM: user.fcm_token, data: JSON.stringify({ assetId: asset.id }) });


        const admin = await prisma.admin.findMany();
        await Promise.all(admin.map(async (admin) => {
            const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Asset Reported', content: `Asset Ref: ‘${asset.AssetName}’ has been flagged as suspicious by User ${user.full_name}. Action required.` });
        }))

        console.log("req.user.id", req.user.id)
        const myUser = await prisma.user.findUnique({ where: { id: req.user.id } });
        const mymail = await sendNotificationEmail({ to: myUser.email, subject: "Asset Reported", template: "mail_template", context: { title: "Asset Reported", message: `You’ve flagged an asset for review. We’ll investigate and update you if needed` }, });



        return res.status(200).json({
            status: 200,
            message: 'Thanks for reporting. We’ll review this asset shortly.',
            success: true,
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}

export async function getAssetStatus(req, res) {
    try {
        const status = await prisma.assetStatus.findMany({});



        return res.status(200).json({
            status: 200,
            message: 'Asset Status',
            success: true,
            status
        })


    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
}


// export async function deleteAccount(req, res) {
//     try {

//         const user = await prisma.user.findUnique({
//             where: {
//                 id: req.user.id
//             }
//         })
//         if (!user) {
//             return res.status(400).json({
//                 status: 400,
//                 message: 'User Not Found',
//                 success: false,
//             })
//         }
//         await prisma.user.delete({
//             where: {
//                 id: req.user.id
//             }
//         })
//         return res.status(200).json({
//             status: 200,
//             message: 'Deleted Account',
//             success: true,
//         })


//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             status: 200,
//             message: 'Internal Server Error',
//             success: false,
//             error: error
//         })

//     }
// }
export async function deleteAccount(req, res) {
    const userId = req.user.id;

    try {

        await prisma.chat.deleteMany({
            where: {
                participants: {
                    some: {
                        id: userId
                    }
                }
            }
        });

        await prisma.reportUser.deleteMany({
            where: {
                reportedByUserId: userId
            }
        })


        const user = await prisma.user.findUnique({ where: { id: userId } });
        console.log('user', user);
        const mail = await sendNotificationEmail({ to: user.email, subject: "Account Closure Notification", template: "mail_template", context: { title: "Account Closure Notification", message: "Your account has been deleted. We're sorry to see you go. If this wasn’t you, please contact support immediately" }, });

        const admin1 = await prisma.admin.findMany();
        await Promise.all(admin1.map(async (admin) => {
            console.log('admin', admin);
            const adminNotification = await createNormalNotificationForAdmin({
                toAdminId: admin.id,
                byUserId: user.id,
                title: "Account Closure Notification",
                message: `User ${user.full_name} has been deleted. We're sorry to see you go. If this wasn’t you, please contact support immediately`,
                type: "USER_DELETED",
            });
            console.log('adminNotification', adminNotification);
        }))

        await prisma.user.delete({
            where: {
                id: userId
            }
        });

        return res.status(200).json({
            status: 200,
            message: 'Your profile has been reported and is under review.',
            success: true
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        });
    }
}


export async function getLastSeen(req, res) {
    try {

        let { userId } = req.params;

        userId = parseInt(userId)
        const userSetting = await prisma.userSetting.findFirst({
            where: {
                userId: userId
            }
        });

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        })

        const data = {
            isLastSeenAllowed: userSetting.lastSeen,
            lastSeen: user.lastSeen
        }
        return res.status(200).json({
            status: 200,
            message: 'Last Seen Data ',
            success: true,
            data: data
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })

    }
};

export async function getFAQs(req, res) {
    try {
        const contactUs = await prisma.contactUs.findFirst({
            orderBy: {
                id: 'desc'
            }
        });

        const faq = await prisma.fAQ.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });

        return res.status(200).json({
            status: 200,
            message: 'FAQ Data',
            success: true,
            data: faq,
            email: contactUs?.email || null,
            phoneNumber: contactUs?.phone_number || null
        });

    } catch (error) {
        console.log(error);

        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        });
    }
}

export async function getMySettings(req, res) {
    try {
        const userSetting = await prisma.userSetting.findFirst({
            where: {
                userId: req.user.id
            }
        });
        return res.status(200).json({
            status: 200,
            message: ' User Settings',
            success: true,
            userSetting: userSetting
        })


    } catch (error) {

        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })
    }

}

export async function updateMySettings(req, res) {
    try {
        const { lastSeen, featurePlanNotification, securePointPlanNotification, chatNotification, emailNotification } = req.body;

        const schema = Joi.alternatives(Joi.object({
            emailNotification: Joi.boolean().optional(),
            lastSeen: Joi.boolean().optional(),
            featurePlanNotification: Joi.boolean().optional(),
            chatNotification: Joi.boolean().optional(),
            securePointPlanNotification: Joi.boolean().optional(),
        }))
        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        var regexPattern = new RegExp("true");

        const user = await prisma.userSetting.findFirst({
            where: {
                userId: req.user.id
            }
        })
        console.log("???????", req.body)
        console.log('user', user)
        console.log(typeof lastSeen)
        console.log(regexPattern.test(lastSeen))
        const userSetting = await prisma.userSetting.update({
            where: {
                id: user.id
            },
            data: {
                lastSeen: lastSeen != null ? lastSeen : true,
                featurePlanNotification: featurePlanNotification != null ? featurePlanNotification : true,
                securePointPlanNotification: securePointPlanNotification != null ? securePointPlanNotification : true,
                chatNotification: chatNotification != null ? chatNotification : true,
                emailNotification: emailNotification != null ? emailNotification : true
            }
        });
        return res.status(200).json({
            status: 200,
            message: ' Notification Settings Updated Successfully',
            success: true,
        })


    } catch (error) {

        console.log(error);
        return res.status(500).json({
            status: 200,
            message: 'Internal Server Error',
            success: false,
            error: error
        })
    }

}

export async function getTermsAndConditions(req, res) {
    res.sendFile(path.join(__dirname, '../view/terms-condition.html'));
}

export async function privacyPolicy(req, res) {
    res.sendFile(path.join(__dirname, '../view/privacy.html'));
}

export async function getAllCategory(req, res) {
    try {
        const categoryList = await prisma.category.findMany({
            orderBy: [
                { display_order: 'asc' },
                { id: 'asc' }
            ]
        });
        console.log(categoryList);
        const formattedCategories = categoryList.map((category) => ({
            ...category,
            categoryImage: category.categoryImage
                ? `${baseurl}/images/${category.categoryImage}`
                : null,
        }));

        return res.json({
            status: 200,
            success: true,
            message: "All Categories data",
            categories: formattedCategories,
            count: formattedCategories.length,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            success: false,
            error: error,
        });
    }
}

export async function getAllSubCategory(req, res) {
    try {
        const { search } = req.query
        const categoryList = await prisma.subCategory.findMany({
            include: {
                category: true
            },
            orderBy: {
                id: 'desc'
            }
        });

        await Promise.all(categoryList.map((category) => {
            if (category.category.categoryImage) {
                category.category.categoryImage = `${baseurl}/images/${category.category.categoryImage}`
            }
        }))

        return res.json({
            status: 200,
            success: true,
            message: "All Sub-Categories ",
            sub_categories: categoryList,
            count: categoryList.length,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            success: false,
            error: error,
        });
    }
}

// new changes

export async function emailPhoneUpdate(req, res) {
    try {
        const { newEmail, newPhone } = req.body;
        const schema = Joi.object({
            newEmail: Joi.string().email().optional().allow(null, ""),
            newPhone: Joi.string().optional().allow(null, "")
        });
        console.log("body", req.body)
        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.status(400).json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        const userId = req.user.id;

        if (newEmail) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email: newEmail,
                    id: {
                        not: parseInt(userId)
                    }
                }
            });
            if (existingUser) return res.status(400).json({ success: false, message: "Email already in use.", status: 400 });

            await prisma.userUpdateRequests.deleteMany({
                where: {
                    userId: userId,
                    newEmail: {
                        not: null
                    }
                }
            })


        }
        if (newPhone) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    phone_no: newPhone,
                    id: {
                        not: parseInt(userId)
                    }
                }
            });
            if (existingUser) return res.status(400).json({ success: false, message: "Phone Number already in use.", status: 400 });

            await prisma.userUpdateRequests.deleteMany({
                where: {
                    userId: userId,
                    newPhone: {
                        not: null
                    }
                }
            })
        }


        // Create request
        await prisma.userUpdateRequests.create({
            data: { userId, newEmail, newPhone, status: "Pending" }
        });
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const mail = await sendNotificationEmail({ to: user.email, subject: "Email/Phone Number Update Request", template: "mail_template", context: { title: "Email/Phone Number Update Request", message: "Your request to change your phone/email is being reviewed by our team. We’ll notify you when it’s approved." }, });

        const admin = await prisma.admin.findMany();
        await Promise.all(admin.map(async (admin) => {
            const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Update Login Credentials Request', content: `User ${user.full_name} has requested to update login credentials. Admin approval required.` });
        }))


        return res.status(200).json({ success: true, message: "We’ve received your request to update your login details. You’ll hear from us once it’s reviewed.", status: 200 });

    }
    catch (error) {
        console.log(error);
        return res.json({
            success: false,
            message: "Internal server error",
            status: 500,
            error: error
        })
    }
};

export const getLabels = async (req, res) => {
    try {

        const data = await prisma.label.findMany({
        });

        res.status(200).json({
            success: true,
            status: 200,
            message: 'Lables',
            data
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            status: error,
            message: 'Internal Server Error',
            error: error
        });
    }
}

export async function createContactUs(req, res) {
    try {
        const schema = Joi.object({
            full_name: Joi.string().optional().allow(null, ""),
            email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
            message: Joi.string().min(1).required(),
        });

        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.status(400).json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                status: 400,
                success: false,
            });
        }

        const { full_name, email, message } = req.body;
        const contact = await prisma.contactUs.create({
            data: {
                full_name: full_name ? String(full_name).trim() : null,
                email: String(email).trim().toLowerCase(),
                message: String(message),
            },
            select: {
                id: true,
                full_name: true,
                email: true,
                message: true,
                created_at: true,
            },
        });

        return res.status(201).json({
            success: true,
            status: 201,
            message: "Contact request submitted",
            data: contact,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal Server Error",
            success: false,
            error: error,
        });
    }
}
