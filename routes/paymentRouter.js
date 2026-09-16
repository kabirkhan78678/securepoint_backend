import express from "express";
import { auth } from "../middlewares/auth.js";
import { getStripeButtonStatus, paymentThroughStripe, stripeFailedPurchasePlan, stripeSuccessAndPurchasePlan, stripeWebhook, revenueCatWebhook } from "../controllers/paymentController.js";


export const paymentRouter = express.Router();


paymentRouter.post('/purchasePlan',auth,paymentThroughStripe);

// paymentRouter.get('/success',stripeSuccessAndPurchasePlan);

// paymentRouter.get('/failed',stripeFailedPurchasePlan);

// Stripe calls this directly (server-to-server). Must receive the raw body for signature verification.
paymentRouter.post('/stripewebhook', stripeWebhook);

// RevenueCat calls this directly (server-to-server).
paymentRouter.post('/revenuecatwebhook', revenueCatWebhook);

paymentRouter.get("/stripe-button-status",  getStripeButtonStatus);
