import { PrismaClient } from "@prisma/client";
import path from 'path'
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

dotenv.config();
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getMyNotifications(req, res) {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (6 - today.getDay()));

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const total = await prisma.adminNotification.count({
            where: {
                toAdminId: req.user.id,
                createdAt: {
                    gte: yesterday, // Notifications from yesterday
                },
            },
        })
        const notifications = await prisma.adminNotification.findMany({
            where: {
                toAdminId: req.user.id,
                createdAt: {
                    gte: yesterday, // Notifications from yesterday
                },

            },
            include: {
                byUser: true,
            },
            orderBy: {
                createdAt: 'desc'
            },
        });
        const unRead = await prisma.adminNotification.count({
            where: {
                toAdminId: req.user.id,
                createdAt: {
                    gte: yesterday, // Notifications from yesterday
                },
                isRead: false
            },
        })
        await Promise.all(notifications.map((data) => {

            if(data.byUser){
                if (data.byUser.avatar_url) {
                    data.byUser.avatar_url = `${baseurl}/images/${data.byUser.avatar_url}`
                }
            }
          
        }))
        return res.status(200).json({
            success: true,
            status: 200,
            message: "Notifications",
            notifications: notifications,
            total: total,
            unRead: unRead
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            status: 500,
            message: "Internal Server Error",
            error: error,
        })
    }

}

export async function markAsRead(req, res) {
    try {
        const { id } = req.params;

        await prisma.notification.update({
            where: {
                id: parseInt(id),
                toUserId: req.user.id
            },
            data: {
                isRead: true
            }
        })
        return res.status(200).json({
            success: true,
            status: 200,
            message: "Notification Read",
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            status: 500,
            message: "Internal Server Error",
            error: error,
        })
    }
}

export async function markAllRead(req, res) {
    try {
        await prisma.notification.updateMany({
            where: {
                toUserId: req.user.id
            },
            data: {
                isRead: true
            }
        })
        return res.status(200).json({
            success: true,
            status: 200,
            message: "Notification Read",
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            status: 500,
            message: "Internal Server Error",
            error: error,
        })
    }
}

export async function deleteNotification(req, res) {
    try {
        let { notificationId } = req.params;

        notificationId = parseInt(notificationId);

        const notification = await prisma.adminNotification.findUnique({
            where: {
                id: notificationId,
                toAdminId: req.user.id
            }
        })

        if (!notification) {
            return res.status(400).json({
                status: 400,
                message: 'Notification Not found',
                success: false,
            })
        }
        await prisma.notification.delete({
            where: {
                id: notificationId,
                toUserId: req.user.id
            }
        })
        return res.status(200).json({
            status: 200,
            message: 'Notification Deleted',
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

export async function deleteAllNotification(req, res) {
    try {
        const result = await prisma.adminNotification.deleteMany({
            where: {
                toAdminId: req.user.id
            }
        });

        if (result.count === 0) {
            return res.status(404).json({
                status: 404,
                message: 'No Notifications Found',
                success: false,
            });
        }

        return res.status(200).json({
            status: 200,
            message: 'Notifications Deleted',
            success: true,
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

