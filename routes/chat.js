import express from "express";
import { auth } from "../middlewares/auth.js";
import { activateDeactivateChat, createOrGetAdminChat, createOrGetAOneOnOneChat, deleteChat, getAllChats, getChatWithAdmin } from "../controllers/chatController.js";
export const chatRouter = express.Router();


chatRouter.get('/',auth,getAllChats);

chatRouter.post('/chatStatus',auth,activateDeactivateChat);

chatRouter.post('/createChatWithAdmin',auth,createOrGetAdminChat)

chatRouter.get('/getChatWithAdmin',auth,getChatWithAdmin)

chatRouter.post('/:receiverId',auth,createOrGetAOneOnOneChat);

chatRouter.delete('/:chatId',auth,deleteChat)




