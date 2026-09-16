import express from "express";
import { auth } from "../middlewares/auth.js";
import { clearChat, getAllAdminChatMessages, getAllMessages, sendMessage, sendMessageToAdmin } from "../controllers/messageController.js";

export const messageRouter = express.Router();



messageRouter.post('/sendMessageToAdmin',auth,sendMessageToAdmin);

messageRouter.post('/:chatId',auth,sendMessage);

messageRouter.get('/getAdminMessages',auth,getAllAdminChatMessages);

messageRouter.get('/:chatId',auth,getAllMessages);

messageRouter.delete('/:chatId',auth,clearChat);
