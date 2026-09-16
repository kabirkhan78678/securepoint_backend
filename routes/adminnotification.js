import express from "express";
import { deleteAllNotification, deleteNotification, getMyNotifications, markAllRead, markAsRead } from "../controllers/adminNotificationController.js";
import { adminAuth } from "../middlewares/adminAuth.js";

export const adminNotificationRouter = express.Router();


adminNotificationRouter.get('/',adminAuth(["SUBADMIN", "ADMIN"]), getMyNotifications);

adminNotificationRouter.put('/',adminAuth(["SUBADMIN", "ADMIN"]), markAllRead);

adminNotificationRouter.patch('/:id',adminAuth(["SUBADMIN", "ADMIN"]),markAsRead);

adminNotificationRouter.delete('/deleteAll',adminAuth(["SUBADMIN", "ADMIN"]),deleteAllNotification);

adminNotificationRouter.delete('/:notificationId', adminAuth(["SUBADMIN", "ADMIN"]), deleteNotification);
