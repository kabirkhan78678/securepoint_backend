import { PrismaClient } from '@prisma/client';
import Joi from 'joi';
import { emitSocketEvent } from '../utils/socket.js'; // Assuming you have this utility function
import { ChatEventEnum } from '../utils/constants.js';

import dotenv from "dotenv";
dotenv.config();
import { getActivePlanForUser } from '../utils/helper.js';
const baseurl = process.env.BASE_URL;
const prisma = new PrismaClient();

export async function createOrGetAOneOnOneChat(req, res) {
    const { receiverId } = req.params;

    try {
        // Check if receiver exists
        const receiver = await prisma.user.findUnique({
            where: { id: parseInt(receiverId) }
        });

        if (!receiver) {
            //throw new ApiError(404, "Receiver does not exist");
            return res.status(404).json({
                status: 404,
                message: 'Receiver does not exist',
                success: false,
            })

        }
        if (receiver.avatar_url) {
            receiver.avatar_url = `${baseurl}/images/${receiver.avatar_url}`
        }
        // Check if receiver is not the user who is requesting a chat
        if (receiver.id === req.user.id) {
            //throw new ApiError(400, "You cannot chat with yourself");
            return res.status(400).json({
                status: 404,
                message: 'You cannot chat with yourself',
                success: false,
            })
        }

        // Check if a chat already exists between the users
        const existingChat = await prisma.chat.findFirst({
            where: {
                participants: {
                    every: {
                        OR: [
                            { id: req.user.id },
                            { id: parseInt(receiverId) }
                        ]
                    }
                }
            }
        });

        if (req.user.avatar_url) {
            req.user.avatar_url = `${baseurl}/images/${req.user.avatar_url}`
        }

        if (existingChat) {

            return res.status(200).json({
                status: 200,
                message: 'Chat retrieved successfully',
                success: true,
                payload: { ...existingChat, participants: [req.user, receiver] }
            })
        }

        const myPlan = await getActivePlanForUser(req.user.id);
        console.log(">>>", myPlan)
        const myActivePlan = myPlan.myPlan.plan;
        if (myActivePlan.id === 1) {
            
            return res.status(400).json({
                status: 200,
                message: 'You cannot initiate chat in free Plan , please upgrade your plan ',
                success: true,
            });
        }

        // Create a new chat
        const newChat = await prisma.chat.create({
            data: {
                name: "One on one chat",
                participants: {
                    connect: [
                        { id: req.user.id },
                        { id: parseInt(receiverId) }
                    ]
                }
            }
        });

        // Emit socket event to inform participants about the new chat
        const payload = {
            ...newChat,
            participants: [req.user, receiver]
        };

        // Emit event to all participants except the current user
        payload.participants.forEach(participant => {
            if (participant.id !== req.user.id) {
                emitSocketEvent(req, participant.id.toString(), ChatEventEnum.NEW_CHAT_EVENT, payload);
            }
        });
        return res.status(201).json({
            status: 201,
            message: 'Chat created successfully',
            success: true,
            payload: payload
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
export async function getAllChats(req, res) {
    try {
        // const reportedUserIDs = (await prisma.reportUser.findMany({
        //     where: {
        //         reportedByUserId: req.user.id
        //     },
        //     select: {
        //         reportedToUserId: true,
        //     }
        // })).map((user) => user.reportedToUserId);
        const chats = await prisma.chat.findMany({
            where: {
                participants: {
                    some:
                        { id: req.user.id },
                    // none: {
                    //     id: {
                    //         in: reportedUserIDs
                    //     }
                    // }
                }
            },
            include: {
                participants: true,
                lastMessage: true,
            }, orderBy: {
                lastMessage: {
                    updatedAt: 'desc'
                }
            }
        })
        await Promise.all(chats.map((chat) => {
            chat.participants.map(async (participant) => {
                // const unreadCountData = await prisma.unreadCount.findFirst({
                //     where:{
                //         chatId:chat.id,
                //         userId:participant.id
                //     }
                // })
                // if(unreadCountData)
                // {
                //     participant.unreadCount = unreadCountData.unreadCount
                // }
                // else{
                //     participant.unreadCount = 0
                // }

                if (participant.avatar_url) {
                    console.log('here');
                    console.log('particpanturl', participant.avatar_url);
                    participant.avatar_url = `${baseurl}/images/${participant.avatar_url}`
                }
                return participant
            })
            return chat
        }))
        // await Promise.all(chats.map(async (chat) => {
        //     chat.participants = await Promise.all(chat.participants.map(async (participant) => {
        //         const unreadCountData = await prisma.unreadCount.findFirst({
        //             where: {
        //                 chatId: chat.id,
        //                 userId: participant.id
        //             }
        //         });
        //         console.log(unreadCountData, "unreadcountdata");
        //         participant.unreadCount = unreadCountData ? unreadCountData.unreadCount : 0;
        //         return participant;
        //     }));
        //     return chat;
        // }));
        await Promise.all(chats.map(async (chat) => {
            const unreadCountData = await prisma.unreadCount.findFirst({
                where: {
                    chatId: chat.id,
                    userId: req.user.id
                }
            });
            chat.unreadCount = unreadCountData ? unreadCountData.unreadCount : 0;
        }));
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
export async function deleteChat(req, res) {
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
        const otherParticipant = chat.participants.find((participant) => participant.id !== req.user.id)
        emitSocketEvent(
            req,
            otherParticipant.id.toString(),
            ChatEventEnum.LEAVE_CHAT_EVENT,
            chat
        );
        await prisma.chat.delete({
            where: {
                id: parseInt(chatId)
            }
        });
        return res.status(200).json({
            status: 200,
            message: 'Chat Deleted Successfully',
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

};
export async function activateDeactivateChat(req, res) {
    try {
        const { chatId } = req.body;
        const schema = Joi.alternatives(Joi.object({
            chatId: Joi.number().required()
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
        const isActivateChat = await prisma.activeChat.findFirst({
            where: {
                userId: req.user.id,
                chatId: chatId
            }
        })
        if (isActivateChat) {
            await prisma.activeChat.delete({
                where: {
                    id: isActivateChat.id
                }
            })
            return res.status(200).json({
                status: 200,
                message: 'Chat Deactivated Successfullt',
                success: true,
            })

        }
        else {
            const activateChat = await prisma.activeChat.create({
                data: {
                    userId: req.user.id,
                    chatId: chatId
                }
            })
            return res.status(200).json({
                status: 200,
                message: 'Chat Activated',
                success: true,
            })
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

export async function deactivateAllUserChats(req, res) {
    try {

        const userActivatedChats = (await prisma.activeChat.findMany({
            where: {
                userId: req.user.id
            }
        })).map((chat) => chat.id);
        await prisma.activeChat.deleteMany({
            where: {
                id: {
                    in: userActivatedChats
                }
            }
        })
        return res.status(200).json({
            status: 200,
            message: 'Deactivated All Chats',
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



//admin chat 

export async function createOrGetAdminChat(req, res) {
    const ADMIN_ID = 1;
    const userId = req.user.id;

    const existingChat = await prisma.adminChat.findFirst({
        where: {
            userId,
            adminId: ADMIN_ID
        },
        include: { admin: true, }
    });

    if (existingChat) {
        return res.status(200).json({ success: true, message: "Chat Retrived Successfully", payload: existingChat });
    }

    const newChat = await prisma.adminChat.create({
        data: {
            userId,
            adminId: ADMIN_ID
        },
        include: { admin: true }
    });

    return res.status(201).json({ success: true, message: "Chat Created Successfully", payload: newChat });
}

export async function getChatWithAdmin(req, res) {
    const userId = req.user.id;

    const existingChat = await prisma.adminChat.findFirst({
        where: {
            userId,
        },
        include: { admin: true,lastMessage:true }
    });


    return res.status(201).json({ success: true, message: "Chat Retrived Successfully", payload: existingChat });
}
