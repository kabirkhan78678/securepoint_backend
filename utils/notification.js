// sendNotification.js
import admin from './firebaseAdmin.js';
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function sendNotificationRelateToPromoteAsset(params) {
    console.log("here ")
    const userSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    });
    if (userSetting === null) {
        await prisma.userSetting.create({
            data: {
                userId: params.toUserId,
            }
        })
    }
    const updateUserSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    })
    console.log(updateUserSetting)
    if (!updateUserSetting.featurePlanNotification) {
        console.log("User has not allowed  feature plan end notifications")
        return;
    }
    if (params.token === null) {
        console.log("User does not have fcm token")
        return;
    }
    console.log("till here ")

    const message = {
        notification: {
            title: params.title,
            body: params.body,
        },
        data: params.data,
        token: params.token,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

export async function sendNotificationRelateToExpirePlan(params) {
    console.log("here ")
    const userSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    });
    if (userSetting === null) {
        await prisma.userSetting.create({
            data: {
                userId: params.toUserId,
            }
        })
    }
    const updateUserSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    })
    console.log(updateUserSetting)
    if (!updateUserSetting.securePointPlanNotification) {
        console.log("User has not allowed  secure plus plan end notifications")
        return;
    }
    if (params.token === null) {
        console.log("User does not have fcm token")
        return;
    }
    console.log("till here ")

    const message = {
        notification: {
            title: params.title,
            body: params.body,
        },
        data: params.data,
        token: params.token,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

export async function sendNotificationRelateToMessage(params) {

    const userSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    });
    if (userSetting === null) {
        await prisma.userSetting.create({
            data: {
                userId: params.toUserId,
            }
        })
    }
    const updateUserSetting = await prisma.userSetting.findFirst({
        where: {
            userId: params.toUserId
        }
    })
    console.log(updateUserSetting.chatNotification)
    if (!updateUserSetting.chatNotification) {
        console.log("User has not allowed  Chat notifications")
        return;
    }
    if (params.token === null) {
        console.log("User does not have fcm token")
        return;
    }
    console.log("till here ")
    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        token: params.token,
        notification: {
            title: 'Chat notification',
            body: `${params.body}`,
        },
        data: {  //you can send only notification or only data(or include both)
            chat_id: params.chatId,
            type: "chat"
        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

export async function createNotification(params) {
    try {
        const { byUserId, toUserId, content, type, data } = params;
        const notification = await prisma.notification.create({
            data: {
                byUserId: byUserId,
                toUserId: toUserId,
                content: content,
                type: type,
                data: data  // Make sure your prisma schema expects Json here
            }
        });
        console.log("Notification created successfully:", notification);
        return notification;
    } catch (error) {
        console.log("Error creating notification:", error);
        throw error;
    }
};

export async function createNormalNotificationForUser(params) {
    try {
        const data = {
            toUserId: params.toUserId,
            byAdminId: params.byAdminId,
            data: params.data,
            title: params.title,
            content: params.content,
            type: params.type
        }
        const notification = await prisma.notification.create({
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

export async function sendNotificationRelateToAppToUser(params) {
    console.log("here ")
    if (params.token === null) {
        console.log("User does not have fcm token")
        return;
    }
    console.log("till here ")
    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        token: params.token,
        notification: {
            title: `${params.title}`,
            body: `${params.body}`,
        },
        data: {
            type: params.type

        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};




export async function createNormalNotificationForAdmin(params) {
    try {
        const data = {
            toAdminId: params.toAdminId,
            byUserId: params.byUserId,
            data: params.data,
            title: params.title,
            content: params.content,
            type: params.type
        }
        const notification = await prisma.adminNotification.create({
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

export async function sendNotificationRelateToAppToAdmin(params) {
    console.log("here ")
    if (params.token === null) {
        console.log("User does not have fcm token")
        return;
    }
    console.log("till here ")
    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        token: params.token,
        notification: {
            title: `${params.title}`,
            body: `${params.body}`,
        },
        data: {
            type: params.type

        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent message:', response);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

