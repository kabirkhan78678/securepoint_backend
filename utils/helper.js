
import crypto from 'crypto'

import { customAlphabet } from "nanoid"
import base64url from 'base64url'
import { PrismaClient } from "@prisma/client";
import { createNotification, sendNotificationRelateToExpirePlan, sendNotificationRelateToPromoteAsset } from './notification.js';
import { sendNotificationEmail } from './sendEmail.js';
const prisma = new PrismaClient();
export function generateOTP(length = 4) {
    const chars = "0123456789";
    let OTP = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        OTP += chars.charAt(randomIndex);
    }

    return OTP;
}

export async function getActivePlanForUser(userId) {
    try {
        const myPlan = await prisma.userSubscription.findFirst({
            where: {
                userId: userId,
                // expired_at: {
                //     gte: new Date()
                // }
                sub_status: 1
            },
            include: {
                plan: true
            }
        });

        if (myPlan) {
            return {
                status: 200,
                message: 'My Active Plan',
                success: true,
                myPlan: myPlan
            };
        } else {
            // Create a default free plan on the fly
            const freePlan = await prisma.plan.findFirst({
                where: {
                    plan_name: "Free"  // Adjust this condition as per your actual free plan identifier
                }
            });

            if (!freePlan) {
                return {
                    status: 404,
                    message: 'Default free plan not found',
                    success: false,
                };
            }

            const startDate = new Date();
            const expiredAt = new Date(); // Free plan expires the same day

            const defaultPlan = {
                id: -1, // Indicates it's a default plan not from DB
                planId: freePlan.id,
                userId: userId,
                created_at: startDate,
                expired_at: expiredAt,
                sub_status: 1, // Assuming active status
                start_date: startDate,
                overlap_status: 0, // Default value
                refund_status: 0, // Default value
                overlap_date: expiredAt,
                plan: freePlan
            };

            return {
                status: 200,
                message: 'My Active Plan',
                success: true,
                myPlan: defaultPlan
            };
        }
    } catch (error) {
        console.error(error);
        return {
            status: 500,
            message: 'Internal Server Error',
            success: false,
            error: error.message
        };
    }
}

export async function getReportedUserIds(userId) {
    const reportedUserIds = (await prisma.reportUser.findMany({
        where: {
            reportedByUserId: userId,
        }
    })).map((user) => user.reportedToUserId)

    return reportedUserIds

}

export async function getReportedAssetIds(userId) {
    const reportedAssetIds = (await prisma.reportAsset.findMany({
        where: {
            reportedBy: userId,
        }
    })).map((asset) => asset.assetId)

    return reportedAssetIds

}
export async function notifyAndExpirePromotions() {
    try {

        const currentDate = new Date();
        const tomorrow = new Date(currentDate.setDate(currentDate.getDate() + 1)).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        console.log("cron job");
        console.log("Tomorrow:", tomorrow);
        console.log("Today:", today);

        // Fetch assets whose promotion ends tomorrow
        const assetsEndingPromotion = await prisma.asset.findMany({
            where: {
                promote: { not: 0 },
                expireAt: tomorrow
            },
            include: {
                user: true
            }
        });

        console.log("assetsEndingPromotion", assetsEndingPromotion)

        // Send notifications
        for (const asset of assetsEndingPromotion) {
            const user = asset.user;
            if (!user.fcm_token) {
                console.log(`User ${user.id} does not have an FCM token`);
            }

            const params = {
                byUserId: 1, // System generated notification
                toUserId: user.id,
                content: `Your asset "${asset.AssetName}" promotion is ending tomorrow.`,
                type: 'PromotionEnding',
                data: { assetId: asset.id.toString() }
            };
            console.log("params", params)
            const notification = await createNotification(params);

            console.log(">>>>>>>", notification)

            const firebaseParams = {
                toUserId: user.id,
                token: user.fcm_token,
                title: 'Asset Promotion Ending tomorrow',
                body: params.content,
                data: { assetId: asset.id.toString() }
            };

            if (user.email) {
                const mailOptions = {
                    from: "yashraj.ctinfotech@gmail.com",
                    to: user.email,
                    subject: "Login Credentials",
                    template: "guest_user",
                    context: {
                        email: email,
                        password: password
                    },
                };
                await sendNotificationEmail(mailOptions);
            }


            await sendNotificationRelateToPromoteAsset(firebaseParams);
        }

        // Reset promotions that expire today
        const expiredPromotions = await prisma.asset.findMany({
            where: {
                promote: { not: 0 },
                expireAt: today
            }
        });

        for (const asset of expiredPromotions) {
            await prisma.asset.update({
                where: { id: asset.id },
                data: {
                    promote: 0,
                    expireAt: null
                }
            });
        }

        console.log('Cron job executed: checked for expired promotions and sent notifications.');

    } catch (error) {
        console.log(error)
    }
}
export async function notifyExpiringPlans() {
    try {
        const currentDate = new Date();

        // Start of tomorrow in UTC
        const startOfToday = new Date(Date.UTC(
            currentDate.getUTCFullYear(),
            currentDate.getUTCMonth(),
            currentDate.getUTCDate(),
            0, 0, 0, 0
        ));

        // End of tomorrow in UTC
        const endOfToday = new Date(Date.UTC(
            currentDate.getUTCFullYear(),
            currentDate.getUTCMonth(),
            currentDate.getUTCDate(),
            23, 59, 59, 999
        ));
        // Start of tomorrow in UTC
        const startOfTomorrow = new Date(Date.UTC(
            currentDate.getUTCFullYear(),
            currentDate.getUTCMonth(),
            currentDate.getUTCDate() + 1,
            0, 0, 0, 0
        ));

        // End of tomorrow in UTC
        const endOfTomorrow = new Date(Date.UTC(
            currentDate.getUTCFullYear(),
            currentDate.getUTCMonth(),
            currentDate.getUTCDate() + 1,
            23, 59, 59, 999
        ));


        console.log("Start of Tomorrow:", startOfTomorrow.toISOString());
        console.log("End of Tomorrow:", endOfTomorrow.toISOString());

        // Fetch subscriptions ending tomorrow
        const expiringSubscriptions = await prisma.userSubscription.findMany({
            where: {
                expired_at: {
                    gte: startOfTomorrow,
                    lte: endOfTomorrow
                },
                sub_status: 1
            },
            include: {
                user: true
            }
        });

        console.log("Expiring Subscriptions:", expiringSubscriptions);

        // Send notifications
        for (const subscription of expiringSubscriptions) {
            const user = subscription.user;
            if (!user.fcm_token) {
                console.log(`User ${user.id} does not have an FCM token`);
                continue;
            }

            const params = {
                byUserId: 1, // System generated notification
                toUserId: user.id,
                content: `Your subscription plan is expiring tomorrow.`,
                type: 'SubscriptionExpiring',
                data: { subscriptionId: subscription.id.toString() }
            };

            const notification = await createNotification(params);

            console.log("Notification:", notification);

            const firebaseParams = {
                toUserId: user.id,
                token: user.fcm_token,
                title: 'Subscription Expiring tomorrow',
                body: params.content,
                data: { subscriptionId: subscription.id.toString() }
            };

            if (user.email) {
                const mailOptions = {
                    from: "yashraj.ctinfotech@gmail.com",
                    to: user.email,
                    subject: "Login Credentials",
                    template: "guest_user",
                    context: {
                        email: email,
                        password: password
                    },
                };
                await sendNotificationEmail(mailOptions);
            }

            await sendNotificationRelateToExpirePlan(firebaseParams);
        }

        const expiriedSubscriptions = await prisma.userSubscription.findMany({
            where: {
                expired_at: {
                    gte: startOfToday,
                    lte: endOfToday
                },
                sub_status: 1
            },
            include: {
                user: true
            }
        });
        for (const subscription of expiriedSubscriptions) {

            await prisma.userSubscription.update({
                where: {
                    id: subscription.id
                },
                data: {
                    expired_at: null,
                    sub_status: 0
                }
            })

        }
        console.log('Notification job executed: checked for expiring subscriptions and sent notifications.');

    } catch (error) {
        console.log(error);
    }
}
export async function generateRandomUICNumber() {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const nanoid = customAlphabet(alphabet, 7);
    let uicNumber;
    do {
        uicNumber = nanoid();
    } while (!(/[a-z]/.test(uicNumber) && /[A-Z]/.test(uicNumber) && /[0-9]/.test(uicNumber)));
    return uicNumber;
};

export async function updateUnreadCount(chatId, userId) {
    try {
        // Find the UnreadCount record for the user and chat
        const unreadCount = await prisma.unreadCount.findFirst({
            where: {
                userId: userId,
                chatId: parseInt(chatId)
            }
        });

        if (unreadCount) {
            // If UnreadCount exists, update the unreadCount by 1
            await prisma.unreadCount.update({
                where: {
                    id: unreadCount.id
                },
                data: {
                    unreadCount: unreadCount.unreadCount + 1
                }
            });
        } else {
            // If UnreadCount does not exist, create a new one
            await prisma.unreadCount.create({
                data: {
                    userId: userId,
                    chatId: parseInt(chatId),
                    unreadCount: 1
                }
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
};

export function randomStringAsBase64Url(size) {
    return base64url(crypto.randomBytes(size));
};