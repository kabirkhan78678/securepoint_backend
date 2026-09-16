import { PrismaClient } from '@prisma/client';
import { emitSocketEvent } from '../utils/socket.js'; // Assuming you have this utility function
import { ChatEventEnum } from '../utils/constants.js';
import Joi from "joi";
import dotenv from "dotenv";
dotenv.config();
import { createNormalNotificationForAdmin, createNotification, sendNotificationRelateToAppToAdmin, sendNotificationRelateToMessage } from '../utils/notification.js';
import { updateUnreadCount } from '../utils/helper.js';
const baseurl = process.env.BASE_URL;
const prisma = new PrismaClient();

export async function sendMessage(req, res) {
    try {
        const { chatId } = req.params;
        const { content , isLink ,isLinkId , isUrl} = req.body;
        const schema = Joi.object({
            content: Joi.string().required(),
            isLink: Joi.number().optional(),
            isLinkId:Joi.string().optional(),
            isUrl : Joi.string().optional()
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
        const chat = await prisma.chat.findUnique({
            where: {
                id: parseInt(chatId)
            },
            include: {
                participants: true
            }
        })
        if (!chat) {
            return res.status(404).json({
                status: 404,
                message: 'Chat does not exists',
                success: false,
            })
        }
        const message = await prisma.chatMessage.create({
            data: {
                content: content || '',
                senderId: req.user.id,
                chatId: parseInt(chatId),
                isLink:isLink ? parseInt(isLink) : 0,
                isLinkId:isLinkId ? isLinkId : null,
                isUrl:isUrl? isUrl : null
            }
        });
        const updateChat = await prisma.chat.update({
            where: {
                id: parseInt(chatId)
            },
            data: {
                lastMessageId: message.id
            }, include: {
                participants: true
            }
        })
        const socketMessage = await prisma.chatMessage.findUnique({
            where: {
                id: message.id
            },
            include: {
                sender: true,
                chat: true,
            }
        })
        if(socketMessage.sender.avatar_url){
            socketMessage.sender.avatar_url = `${baseurl}/images/${socketMessage.sender.avatar_url}`
        }
        updateChat.participants.forEach(async(participant) => {
            if (participant.id === req.user.id) return;

            const isActiveChat = await prisma.activeChat.findFirst({
                where:{
                    userId:participant.id,
                    chatId:parseInt(chatId)
                }
            })
            if(!isActiveChat){
                console.log("isActive",isActiveChat)
                await createNotification({
                    toUserId: participant.id,
                    byUserId: req.user.id,
                    data: {
                        chatId: chatId
                    },
                    type:'chat',
                    content: `${req.user.full_name} sent you a message`
                })
                await sendNotificationRelateToMessage({
                    token: participant.fcm_token,
                    toUserId:participant.id,
                    body:`${req.user.full_name} sent you a message`,
                    chatId:chatId
                })
                await updateUnreadCount(chatId, participant.id);
            }
            emitSocketEvent(
                req,
                participant.id.toString(),
                ChatEventEnum.MESSAGE_RECEIVED_EVENT,
                socketMessage
            );
           
        })
        return res.status(200).json({
            status: 200,
            message: 'Message send Successfully',
            success: true,
            message: socketMessage
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

export async function getAllMessages(req, res) {
    try {
        const { chatId } = req.params;
        const chat = await prisma.chat.findUnique({
            where: {
                id: parseInt(chatId)
            },
            include: {
                participants: true
            }
        })
        if (!chat) {
            return res.status(404).json({
                status: 404,
                message: 'Chat does not exists',
                success: false,
            })
        }
        const messages = await prisma.chatMessage.findMany({
            where: {
                chatId: parseInt(chatId),
            },
            include: {
                sender: true,
                chat: true
            },
            orderBy:{
                createdAt:"desc"
            }
        })
        const unreadCountData = await prisma.unreadCount.findFirst({
            where:{
                userId:req.user.id,
                chatId:parseInt(chatId)
            }
        })
        if(unreadCountData){
            await prisma.unreadCount.update({
                where:{
                    id:unreadCountData.id
                },
                data:{
                    unreadCount:0
                }
            })
        }
      
        await Promise.all(messages.map((message)=>{
            if(message.sender.avatar_url){
                message.sender.avatar_url = `${baseurl}/images/${message.sender.avatar_url}`
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

export async function clearChat(req, res) {
    try {
        const { chatId } = req.params;
        const chat = await prisma.chat.findUnique({
            where: {
                id: parseInt(chatId)
            },
            include: {
                participants: true
            }
        })
        if (!chat) {
            return res.status(404).json({
                status: 404,
                message: 'Chat does not exists',
                success: false,
            })
        }
        await prisma.chatMessage.deleteMany({
            where: {
                chatId: parseInt(chatId)
            }
        })
        return res.status(200).json({
            status: 200,
            message: 'Chat Cleared Successfully',
            success: true,
        })

    } catch (error) {
        console.log(error);
        return  res.status(500).json({
            status:200,
            message:'Internal Server Error',
            success:false,
            error:error
        })
    }
}

export async function getAllAdminChatMessages(req, res) {
    try {
        const chat = await prisma.adminChat.findFirst({
            where: {
                userId: parseInt(req.user.id)
            },
        })
        if (!chat) {
            return res.status(404).json({
                status: 404,
                message: 'Chat does not exists',
                success: false,
            })
        }
        const messages = await prisma.adminChatMessage.findMany({
            where: {
                chatId: parseInt(chat.id),
            },
            include: {
                senderAdmin: true,
                senderUser: true,
            },
            orderBy: {
                createdAt: "desc"
            }
        })

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

export async function sendMessageToAdmin(req, res) {
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
        where: { id: parseInt(chatId), userId: req.user.id },
    });

    if (!chat) {
        return res.status(404).json({ success: true, message: "Chat Not Found", status: 404 });
    }



    const message = await prisma.adminChatMessage.create({
        data: {
            chatId: chat.id,
            senderUserId: req.user.id,
            content
        }
    });

    await prisma.adminChat.update({
        where: {
            id: chat.id
        },
        data: {
            lastMessageId: message.id
        }
    })
    const admin = await prisma.admin.findMany();
    await createNormalNotificationForAdmin({
        toAdminId: admin[0].id,
        title: "Support Notification ",
        byUserId: req.user.id,
        data: {},
        type: "Admin_Feebback",
        content: `${req.user.full_name} send a support chat `
    })
    await sendNotificationRelateToAppToAdmin({
        token: admin[0].fcm_token,
        title: "Support Notification",
        toAdminId: admin[0].id,
        body: `${req.user.full_name} send a support chat`,
        data: {},
        type: `Admin_Feebback`
    })

    return res.json({ success: true, status: 200, message: 'Message Sent Successfully' });
}