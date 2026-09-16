import { PrismaClient } from '@prisma/client';
import Joi from 'joi';
import dotenv from "dotenv";
import { createNormalNotificationForUser, sendNotificationRelateToAppToUser } from '../utils/notification.js';
dotenv.config();
const baseurl = process.env.BASE_URL;
const prisma = new PrismaClient();


export async function getAllChats(req, res) {
    try {

        const chats = await prisma.adminChat.findMany({
            where: {
                adminId: req.user.id
            },
            include: {
                user: true,
                lastMessage: true,
            }, orderBy: {
                lastMessage: {
                    createdAt: 'desc'
                }
            }
        })

        console.log("11111111111111111111")

        await Promise.all(chats.map((data) => {
            if (data.user.avatar_url) {
                data.user.avatar_url = `${baseurl}/images/${data.user.avatar_url}`

            }

        }))

        console.log("22222222222222222222")

        return res.status(200).json({
            status: 200,
            message: 'Chats Retrieved Successfully',
            success: true,
            chats: chats
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

export async function getAllMessages(req, res) {
    try {
        const { chatId } = req.params;
        const chat = await prisma.adminChat.findUnique({
            where: {
                id: parseInt(chatId)
            },
        })
        if (!chat) {
            return res.status(404).json({
                status: 404,
                message: 'Chat does not exist',
                success: false,
            })
        }
        const messages = await prisma.adminChatMessage.findMany({
            where: {
                chatId: parseInt(chatId),
            },
            include: {
                senderAdmin: true,
                senderUser: true,
            },
            orderBy: {
                createdAt: "desc"
            }
        })

        await Promise.all(messages.map((chat) => {
            if (chat.senderUser) {
                if (chat.senderUser.avatar_url) {
                    chat.senderUser.avatar_url = `${baseurl}/images/${chat.senderUser.avatar_url}`
                }
            }
        }))

        return res.status(200).json({
            status: 200,
            message: 'Messages',
            success: true,
            messages: messages
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

export async function sendMessageToUser(req, res) {
    const { chatId, content } = req.body;
    console.log("after")
    const schema = Joi.alternatives(Joi.object({
        chatId: Joi.number().integer().required(),
        content: Joi.string().required()
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

    const chat = await prisma.adminChat.findUnique({
        where: { id: parseInt(chatId) },
        include: {
            user: true
        }
    });

    const message = await prisma.adminChatMessage.create({
        data: {
            chatId: chat.id,
            senderAdminId: req.user.id,
            content
        }
    });

    const admin = await prisma.admin.findMany();

    await prisma.adminChat.update({
        where: {
            id: chat.id
        },
        data: {
            lastMessageId: message.id
        }
    })

    await createNormalNotificationForUser({
        toUserId: chat.userId,
        title: "Support Chat Notification",
        byAdminId: admin[0].id,
        data: {},
        type: "support_chat",
        content: "Admin Replied to your query"
    })
    await sendNotificationRelateToAppToUser({
        token: chat.user.fcm_token,
        title: "Support Chat Notification",
        toUserId: chat.userId,
        body: "Admin Replied to your query",
        data: {},
        type: "support_chat",
    })

    return res.json({ success: true, status: 200, message: 'Message Sent Successfully' });
}

