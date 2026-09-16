import express from "express";
import { auth } from "../middlewares/auth.js";
import { getAllChats, getAllMessages, sendMessageToUser } from "../controllers/adminChatController.js";
import { adminAuth } from "../middlewares/adminAuth.js";

export const adminChatRouter = express.Router();


adminChatRouter.get('/',adminAuth(["SUBADMIN", "ADMIN"]),getAllChats);

adminChatRouter.get('/getAllMessages/:chatId',adminAuth(["SUBADMIN", "ADMIN"]),getAllMessages)

adminChatRouter.post('/sendMessage',adminAuth(["SUBADMIN", "ADMIN"]),sendMessageToUser);






