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
import { currencyMap } from "../utils/constants.js";
import { sendNotification, sendNotificationEmail } from "../utils/helpers/notification.service.js";
import { createNormalNotificationForAdmin } from "../utils/notification.js";
dotenv.config();
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SINCH_APPLICATION_KEY = process.env.SINCH_APPLICATION_KEY
const SINCH_APPLICATION_SECRET = process.env.SINCH_APPLICATION_SECRET
const SINCH_BASE_URL = process.env.SINCH_BASE_URL;
const stripe = new Stripe(process.env.STRIPE_SECRETS);
const stripeWebhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET ||
    'whsec_Rh5ADJjpSnlxxT5vMJaXTUHjw209ktPR';

function createCaptureRes() {
    const res = {
        statusCode: 200,
        body: undefined,
    };
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    res.send = (body) => {
        res.body = body;
        return res;
    };
    res.end = () => res;
    res.render = () => res;
    return res;
}
//withour weebhook
// export async function paymentThroughStripe(req, res) {
//     const { planId } = req.body;

//     const schema = Joi.alternatives(
//         Joi.object({
//             planId: Joi.number().required(),
//         })
//     )
//     console.log("body", req.body)
//     const result = schema.validate(req.body);
//     if (result.error) {
//         const message = result.error.details.map((i) => i.message).join(",");
//         return res.json({
//             message: result.error.details[0].message,
//             error: message,
//             missingParams: result.error.details[0].message,
//             status: 400,
//             success: false,
//         });
//     }

//     const plan = await prisma.plan.findUnique({
//         where: { id: parseInt(planId) }
//     });

//     if (!plan) {
//         return res.status(404).json({ message: "Plan not found" });
//     }

//     const session = await stripe.checkout.sessions.create({
//         payment_method_types: ['card'],
//         line_items: [{
//             price_data: {
//                 currency: 'usd',
//                 product_data: {
//                     name: plan.plan_name,
//                 },
//                 unit_amount: parseFloat(plan.amount) * 100, // Stripe expects amount in cents
//             },
//             quantity: 1,
//         }],
//         mode: 'payment',
//         success_url: `${baseurl}/user/payment/success?planId=${planId}&userId=${req.user.id}`,
//         cancel_url: `https://your-backend-url/cancel`,
//         metadata: {
//             // req.user.id,
//             // planId
//         }
//     });

//     res.json({ id: session.url });
// };
export async function paymentThroughStripe(req, res) {
    try {
        const { planId } = req.body;

        const schema = Joi.object({
            planId: Joi.number().required(),
        });

        const result = schema.validate(req.body);
        if (result.error) {
            const message = result.error.details.map((i) => i.message).join(",");
            return res.status(400).json({
                message: result.error.details[0].message,
                error: message,
                missingParams: result.error.details[0].message,
                success: false,
            });
        }

        const plan = await prisma.plan.findUnique({
            where: { id: parseInt(planId) }
        });

        if (!plan) {
            return res.status(404).json({ message: "Plan not found" });
        }

        const existingSubscription = await prisma.userSubscription.findFirst({
            where: {
                userId: parseInt(req.user.id),
                sub_status: 1
            }
        });


        if (existingSubscription) {
            if (existingSubscription.planId === parseInt(planId)) {
                return res.status(400).json({
                    status: 400,
                    message: 'A plan is already running',
                    success: false,
                })
            }
            if (existingSubscription.planId > parseInt(planId)) {
                return res.status(400).json({
                    status: 400,
                    message: 'You cannot downgrade a running plan.',
                    success: false,
                })
            }
        }
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id
            }
        })
        const userCountry = user.country;
        let currencyCode = 'usd'
        let amount = plan.amount;
        if (userCountry) {
            currencyCode = currencyMap[userCountry];
            if (currencyCode) {
                amount = plan[currencyCode];
                if (!amount) {
                    amount = plan.amount
                }
            }
            else {
                currencyCode = 'usd'
            }

        }
        console.log("currencyCode", currencyCode);
        console.log("plan", plan);
        console.log("amount", amount);

        const successBase = process.env.STRIPE_SUCCESS_URL || `${process.env.BASE_URL || 'https://securpoint.app:4000'}/user/payment/success`;
        const cancelBase = process.env.STRIPE_CANCEL_URL || `${process.env.BASE_URL || 'https://securpoint.app:4000'}/user/payment/failed`;
        const sepSuccess = successBase.includes('?') ? '&' : '?';
        const sepCancel = cancelBase.includes('?') ? '&' : '?';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: currencyCode,
                    product_data: {
                        name: plan.plan_name,
                    },
                    unit_amount: parseFloat(amount) * 100, // Stripe expects amount in cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${successBase}${sepSuccess}planId=${planId}&userId=${req.user.id}&currency=${currencyCode}&price=${amount}`,
            cancel_url: `${cancelBase}${sepCancel}planId=${planId}&userId=${req.user.id}&currency=${currencyCode}&price=${amount}`,
            metadata: {
                userId: req.user.id,
                planId: planId,
                currency: currencyCode,
                price: `${amount}`,
            }
        });

        // return res.json({ url: session.url });
        return res.json({ url: session.url, planId: planId, userId: req.user.id, currency: currencyCode, price: amount, success: true });


    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error,
        });
    }


};

export async function stripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    console.log("Stripe Webhook Called......................");

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed.', err?.message || err);
        return res.status(400).send(`Webhook Error: ${err?.message || 'Invalid signature'}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const metadata = session?.metadata || {};

            const userId = metadata.userId;
            const planId = metadata.planId;
            const currency = metadata.currency || session?.currency;
            const price =
                metadata.price ||
                (typeof session?.amount_total === 'number' ? `${session.amount_total / 100}` : undefined);

            if (userId && planId) {
                const captureRes = createCaptureRes();
                await stripeSuccessAndPurchasePlan(
                    { query: { userId, planId, currency, price,payment_method : "Stripe" } },
                    captureRes
                );
                if (captureRes.statusCode >= 400) {
                    throw new Error(`stripeSuccessAndPurchasePlan failed with status ${captureRes.statusCode}`);
                }
            } else {
                console.warn('Stripe webhook: missing metadata.userId/metadata.planId');
            }
        } else if (
            event.type === 'checkout.session.expired' ||
            event.type === 'checkout.session.async_payment_failed'
        ) {
            const session = event.data.object;
            const metadata = session?.metadata || {};

            const userId = metadata.userId;
            const planId = metadata.planId;
            const currency = metadata.currency || session?.currency;
            const price =
                metadata.price ||
                (typeof session?.amount_total === 'number' ? `${session.amount_total / 100}` : undefined);

            if (userId && planId) {
                const captureRes = createCaptureRes();
                await stripeFailedPurchasePlan(
                    { query: { userId, planId, currency, price,payment_method : "Stripe" } },
                    captureRes
                );
                if (captureRes.statusCode >= 400) {
                    throw new Error(`stripeFailedPurchasePlan failed with status ${captureRes.statusCode}`);
                }
            } else {
                console.warn('Stripe webhook (failed): missing metadata.userId/metadata.planId');
            }
        } else if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object;
            const metadata = paymentIntent?.metadata || {};
            const userId = metadata.userId;
            const planId = metadata.planId;

            if (userId && planId) {
                const captureRes = createCaptureRes();
                await stripeFailedPurchasePlan(
                    { query: { userId, planId } },
                    captureRes
                );
                if (captureRes.statusCode >= 400) {
                    throw new Error(`stripeFailedPurchasePlan failed with status ${captureRes.statusCode}`);
                }
            }
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error handling Stripe webhook event:', error);
        return res.status(500).json({ received: false });
    }
}

export async function revenueCatWebhook(req, res) {
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    console.log("RevenueCat Webhook Called......................");
    console.log("req.body ......................==>", req.body);
    if (expectedSecret) {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
        if (token !== expectedSecret) {
            return res.status(401).json({ received: false, message: 'Unauthorized' });
        }
    }

    try {
        const payload = req.body || {};
        const event = payload.event || payload;
        const eventType = event?.type || event?.event_type;

        const appUserId =
            event?.app_user_id ??
            event?.appUserId ??
            event?.subscriber?.app_user_id ??
            event?.subscriber?.appUserId;

        const productId =
            event?.product_id ??
            event?.productId ??
            event?.purchased_product_id ??
            event?.entitlement_id ??
            event?.entitlementId;

        let planId = undefined;
        if (typeof productId === 'string' && /^\d+$/.test(productId)) {
            planId = productId;
        }

        if (!planId && process.env.REVENUECAT_PRODUCT_PLAN_MAP) {
            try {
                const map = JSON.parse(process.env.REVENUECAT_PRODUCT_PLAN_MAP);
                console.log("map ......................==>", map);
                const mapped = map?.[productId];
                if (mapped !== undefined && mapped !== null) {
                    planId = `${mapped}`;
                }
            } catch (e) {
                console.warn('Invalid REVENUECAT_PRODUCT_PLAN_MAP JSON.');
            }
        }

        const currency =
            event?.currency ||
            event?.price_currency ||
            event?.purchased_currency ||
            event?.price?.currency;

        const price =
            event?.price_in_purchased_currency ||
            event?.price ||
            event?.price_amount ||
            event?.purchase_price ||
            event?.revenue ||
            event?.revenue_in_usd;

        const successTypes = new Set([
            'INITIAL_PURCHASE',
            'NON_RENEWING_PURCHASE',
            'RENEWAL',
            'PRODUCT_CHANGE',
        ]);
        const failureTypes = new Set([
            'BILLING_ISSUE',
            'CANCELLATION',
            'EXPIRATION',
            'UNCANCELLATION',
        ]);

        if (!eventType) {
            return res.status(400).json({ received: false, message: 'Missing event type' });
        }

        if (!appUserId || !planId) {
            return res.status(400).json({
                received: false,
                message: 'Missing app_user_id or planId mapping',
                details: { appUserId: appUserId ?? null, productId: productId ?? null },
            });
        }

        if (successTypes.has(eventType)) {
            const captureRes = createCaptureRes();
            await stripeSuccessAndPurchasePlan(
                { query: { userId: appUserId, planId, currency, price: price !== undefined ? `${price}` : undefined } },
                captureRes
            );
            if (captureRes.statusCode >= 400) {
                throw new Error(`stripeSuccessAndPurchasePlan failed with status ${captureRes.statusCode}`);
            }
            return res.status(200).json({ received: true });
        }

        if (failureTypes.has(eventType)) {
            const captureRes = createCaptureRes();
            await stripeFailedPurchasePlan(
                { query: { userId: appUserId, planId, currency, price: price !== undefined ? `${price}` : undefined } },
                captureRes
            );
            if (captureRes.statusCode >= 400) {
                throw new Error(`stripeFailedPurchasePlan failed with status ${captureRes.statusCode}`);
            }
            return res.status(200).json({ received: true });
        }

        return res.status(200).json({ received: true, ignored: true, type: eventType });
    } catch (error) {
        console.error('Error handling RevenueCat webhook event:', error);
        return res.status(500).json({ received: false });
    }
}

export async function stripeSuccessAndPurchasePlan(req, res) {
    try {
        const params = { ...(req.query || {}), ...(req.body || {}) };
        const planId = params.planId;
        let userId = params.userId || req.user?.id;
        const currency = params.currency;
        const price = params.price;
        const payment_method = params.payment_method || params.paymentMethod || "Stripe";

        if (!userId && req.headers?.authorization) {
            try {
                const parts = req.headers.authorization.split(' ');
                const token = parts.length === 2 ? parts[1] : parts[0];
                if (token) {
                    const decoded = jwt.verify(token, process.env.SECRET_KEY);
                    if (decoded?.userId) {
                        userId = decoded.userId;
                    }
                }
            } catch (e) {
                // ignore token verify error
            }
        }

        if (!planId) {
            return res.status(400).json({ success: false, status: 400, message: "Plan ID is required" });
        }

        console.log("Stripe success called for:", { userId, planId, currency, price, payment_method });

        // Currency Symbol Mapping
        let currencySymbol = '$';
        const cur = currency?.toLowerCase();
        if (cur === 'inr') currencySymbol = '₹';
        else if (cur === 'usd') currencySymbol = '$';
        else if (cur === 'ngn') currencySymbol = '₦';
        else if (cur === 'gbp') currencySymbol = '£';

        // Get Plan
        const plan = await prisma.plan.findUnique({
            where: { id: parseInt(planId) }
        });

        if (!plan) {
            return res.status(404).json({ success: false, status: 404, message: "Plan not found" });
        }

        const parsedUserId = userId ? parseInt(userId) : null;
        let activeSub = null;

        if (parsedUserId) {
            // Check Existing Subscription
            const existingSubscription = await prisma.userSubscription.findFirst({
                where: { userId: parsedUserId, sub_status: 1 }
            });

            if (existingSubscription && existingSubscription.planId === parseInt(planId)) {
                console.log("Subscription already active for user and plan:", parsedUserId, planId);
                activeSub = existingSubscription;
            } else {
                if (existingSubscription) {
                    await prisma.userSubscription.update({
                        where: { id: existingSubscription.id },
                        data: { sub_status: 0 }
                    });
                }

                // Calculate dates
                const startDate = new Date();
                const expiredAt = new Date(startDate);
                expiredAt.setMonth(startDate.getMonth() + (plan.plan_days || 1));

                // Create Subscription
                activeSub = await prisma.userSubscription.create({
                    data: {
                        planId: parseInt(planId),
                        userId: parsedUserId,
                        start_date: startDate,
                        expired_at: expiredAt,
                        sub_status: 1,
                        overlap_status: 0,
                        refund_status: 0,
                        overlap_date: expiredAt,
                        payment_method: payment_method || "Stripe"
                    }
                });

                // Reset promoted asset count
                await prisma.user.update({
                    where: { id: parsedUserId },
                    data: { promotedAssetCount: 0 }
                });

                // Send Confirmation Email & notifications
                const user = await prisma.user.findUnique({ where: { id: parsedUserId } });
                if (user) {
                    try {
                        await sendNotificationEmail({
                            to: user.email,
                            subject: "Plan Activated",
                            template: "mail_template",
                            context: {
                                title: "Asset Added",
                                message: `Welcome to ${plan.plan_name} Plan. Your subscription is now active.`,
                                plan_name: plan.plan_name,
                                duration: `${plan.plan_days} Months`,
                                price: `${currencySymbol} ${price || (cur && plan[cur]) || plan.amount}`
                            }
                        });

                        await sendNotification({
                            toUserIds: parsedUserId,
                            title: 'Plan Purchased',
                            content: `You have successfully upgraded to ${plan.plan_name} Plan.`,
                            sendFCM: true
                        });

                        const admins = await prisma.admin.findMany();
                        await Promise.all(
                            admins.map((admin) =>
                                createNormalNotificationForAdmin({
                                    toAdminId: admin.id,
                                    byUserId: user.id,
                                    title: 'Plan Purchased',
                                    content: `User ${user.full_name || user.email} has upgraded to ${plan.plan_name} Plan.`
                                })
                            )
                        );
                    } catch (notifyErr) {
                        console.error("⚠️ Notification / Email failed in success flow:", notifyErr);
                    }
                }
            }
        }

        if (req.method === 'POST' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
            return res.status(200).json({
                success: true,
                status: 200,
                message: "Plan activated successfully",
                data: activeSub
            });
        }

        const dashboardUrl = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || process.env.BASE_URL || "https://securpoint.app:4000";
        const logoUrl = process.env.LOGO_URL || `${process.env.BASE_URL || "https://securpoint.app:4000"}/mainLogo.png`;

        // Render Confirmation Page
        return res.render(
            path.join(__dirname, '../view/confirmation.ejs'),
            {
                user: userId,
                plan: plan,
                currencySymbol,
                price: price || (cur && plan[cur]) || plan.amount,
                startDate: activeSub ? activeSub.start_date : new Date(),
                expiredAt: activeSub ? activeSub.expired_at : new Date(),
                dashboardUrl,
                logoUrl
            }
        );

    } catch (error) {
        console.error("❌ Error in stripeSuccessAndPurchasePlan:", error);
        if (req.method === 'POST' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
            return res.status(500).json({
                success: false,
                status: 500,
                message: "Internal server error",
                error: error.message
            });
        }
        return res.status(500).send("Internal server error while processing payment success");
    }
}


// export async function stripeSuccessAndPurchasePlan(req, res) {
//     const { userId, planId, currency, price } = req.query;

//     if (!planId) {
//         return res.status(400).json({ message: "Plan ID is required" });
//     }

//     let currencySymbol = '$';
//     if (currency && currency.toLowerCase() === 'inr') {
//         currencySymbol = '₹';
//     } else if (currency && currency.toLowerCase() === 'usd') {
//         currencySymbol = '$';
//     }else if (currency && currency.toLowerCase() === 'ngn') {
//         currencySymbol = '₦';
//     }else if (currency && currency.toLowerCase() === 'gbp') {
//         currencySymbol = '£';
//     }

//     // const session = await stripe.checkout.sessions.retrieve(session_id);

//     // if (!session) {
//     //     return res.status(404).json({ message: "Session not found" });
//     // }


//     const plan = await prisma.plan.findUnique({
//         where: { id: parseInt(planId) }
//     });

//     if (!plan) {
//         return res.status(404).json({ message: "Plan not found" });
//     }

//     const existingSubscription = await prisma.userSubscription.findFirst({
//         where: { userId: parseInt(userId), sub_status: 1 }
//     });

//     const startDate = new Date();
//     const expiredAt = new Date(startDate);
//     expiredAt.setMonth(startDate.getMonth() + plan.plan_days);

//     const newSubscription = await prisma.userSubscription.create({
//         data: {
//             planId: parseInt(planId),
//             userId: parseInt(userId),
//             start_date: startDate,
//             expired_at: expiredAt,
//             sub_status: 1,  // Active status
//             overlap_status: 0,  // Default value
//             refund_status: 0,  // Default value
//             overlap_date: expiredAt,  // Assuming overlap date is the same as expiry date
//         }
//     });

//     await prisma.user.update({
//         where: { id: parseInt(userId) },
//         data: { promotedAssetCount: 0 }
//     });

//     const user = await prisma.user.findUnique({ where: { id: userId } });
//     const mail = await sendNotificationEmail({ to: user.email, subject: "Plan Activated", template: "mail_template", context: { title: "Asset Added", message: `Welcome to ${plan.plan_name} Plan. Your subscription is now active.`, plan_name: plan.plan_name,duration : `${plan.plan_days} days`,price: `${currencySymbol} ${price}` }, });

//     const notification = await sendNotification({ toUserIds: userId, title: 'Plan Purchased', content: `You have successfully upgraded to ${plan.plan_name} Plan.`, sendFCM: true });

//     const admin = await prisma.admin.findMany();
//     await Promise.all(admin.map(async (admin) => {
//         const adminNotification = await createNormalNotificationForAdmin({ toAdminId: admin.id, byUserId: user.id, title: 'Plan Purchased', content: `User ${user.full_name} has upgraded to ${plan.plan_name} Plan.` });
//     }))

//     res.render(path.join(__dirname, '../view/', 'confirmation.ejs'), {
//         user: userId,
//         plan: plan,
//         startDate: startDate,
//         expiredAt: expiredAt
//     });
//     // // Create a URL for the confirmation page
//     // const confirmationUrl = `${process.env.FRONTEND_URL}/confirmation?session_id=${session_id}`;

//     // res.json({ confirmationUrl });
// };

export async function successPage(req, res) {
    const filePath = path.join(__dirname, '../view/English_ligth/terms-condition.html');
    res.sendFile(filePath);
};

export async function stripeFailedPurchasePlan(req, res) {
    try {
        const params = { ...(req.query || {}), ...(req.body || {}) };
        const planId = params.planId;
        let userId = params.userId || req.user?.id;
        const currency = params.currency;
        const price = params.price;

        if (!userId && req.headers?.authorization) {
            try {
                const parts = req.headers.authorization.split(' ');
                const token = parts.length === 2 ? parts[1] : parts[0];
                if (token) {
                    const decoded = jwt.verify(token, process.env.SECRET_KEY);
                    if (decoded?.userId) {
                        userId = decoded.userId;
                    }
                }
            } catch (e) {
                // ignore token verify error
            }
        }

        console.log("Stripe failed called for:", { userId, planId, currency, price });

        let plan = null;
        if (planId) {
            plan = await prisma.plan.findUnique({
                where: { id: parseInt(planId) }
            });
        }

        let currencySymbol = '$';
        const cur = currency?.toLowerCase();
        if (cur === 'inr') currencySymbol = '₹';
        else if (cur === 'usd') currencySymbol = '$';
        else if (cur === 'ngn') currencySymbol = '₦';
        else if (cur === 'gbp') currencySymbol = '£';

        const parsedUserId = userId ? parseInt(userId) : null;
        if (parsedUserId) {
            const user = await prisma.user.findUnique({ where: { id: parsedUserId } });
            if (user) {
                try {
                    await sendNotificationEmail({
                        to: user.email,
                        subject: "Payment Failed",
                        template: "mail_template",
                        context: {
                            title: "Payment Failed",
                            message: `We couldn’t process your subscription payment. Please check your details or try again.`
                        }
                    });

                    await sendNotification({
                        toUserIds: parsedUserId,
                        title: 'Payment Failed',
                        content: `Payment for your subscription didn’t go through. Please update your payment details.`,
                        sendFCM: true
                    });

                    const admins = await prisma.admin.findMany();
                    await Promise.all(admins.map(async (admin) => {
                        await createNormalNotificationForAdmin({
                            toAdminId: admin.id,
                            byUserId: user.id,
                            title: 'Plan Payment Failed',
                            content: `Payment attempt failed for User ${user.full_name || user.email}. Plan: ${plan ? plan.plan_name : 'Unknown'}.`
                        });
                    }));
                } catch (notifyErr) {
                    console.error("⚠️ Failed notification error:", notifyErr);
                }
            }
        }

        if (req.method === 'POST' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
            return res.status(200).json({
                success: false,
                status: 400,
                message: "Payment failed or cancelled"
            });
        }

        const dashboardUrl = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || process.env.BASE_URL || "https://securpoint.app:4000";
        const logoUrl = process.env.LOGO_URL || `${process.env.BASE_URL || "https://securpoint.app:4000"}/mainLogo.png`;

        return res.render(
            path.join(__dirname, '../view/failed.ejs'),
            {
                user: userId,
                plan: plan,
                currencySymbol,
                price: price || (cur && plan && plan[cur]) || (plan ? plan.amount : ''),
                dashboardUrl,
                logoUrl
            }
        );
    } catch (error) {
        console.error("❌ Error in stripeFailedPurchasePlan:", error);
        if (req.method === 'POST' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'))) {
            return res.status(500).json({
                success: false,
                status: 500,
                message: "Internal server error",
                error: error.message
            });
        }
        return res.status(500).send("Internal server error while processing payment failure");
    }
};


export const getStripeButtonStatus = async (req, res) => {

    res.status(200).json({
        success: true,
        status: 200,
        message: 'Stripe button status fetched successfully.',
        data: true,
    });
}
