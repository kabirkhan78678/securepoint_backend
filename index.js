import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { Server } from "socket.io";
import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import cors from "cors";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { notifyAndExpirePromotions, notifyExpiringPlans } from "./utils/helper.js";
import { initializeSocketIO } from "./utils/socket.js";
import { userRouter } from "./routes/userRouter.js";
import { chatRouter } from "./routes/chat.js";
import { messageRouter } from "./routes/message.js";
import { adminRouter } from "./routes/adminRouter.js";
import { paymentRouter } from "./routes/paymentRouter.js";
import { notificationRouter } from "./routes/notification.js";
import { adminChatRouter } from "./routes/adminChatRouter.js";
import { adminNotificationRouter } from "./routes/adminnotification.js";

const app = express();
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRETS || "");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "view"));

// SSL Configuration with automatic fallback to HTTP if certificates are missing
let httpServer;
let protocol = "http";

const sslKeyPath = process.env.SSL_KEY_PATH || "/etc/letsencrypt/live/securpoint.app/privkey.pem";
const sslCertPath = process.env.SSL_CERT_PATH || "/etc/letsencrypt/live/securpoint.app/fullchain.pem";

if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  try {
    const sslOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
    };
    httpServer = https.createServer(sslOptions, app);
    protocol = "https";
  } catch (err) {
    httpServer = http.createServer(app);
    protocol = "http";
  }
} else {
  httpServer = http.createServer(app);
  protocol = "http";
}

// Socket.io setup
const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  },
});
app.set("io", io);

// Global Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.static("public"));

// Stripe Webhook Endpoint
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    console.log("code reaches here>>>>>>>>>>>>>>>>>>>");
    const session = event.data.object;
    const { userId, planId } = session.metadata;

    const plan = await prisma.plan.findUnique({
      where: { id: parseInt(planId) },
    });

    if (!plan) {
      console.error("Plan not found for ID:", planId);
      return res.status(404).json({ message: "Plan not found" });
    }

    const startDate = new Date();
    const expiredAt = new Date(startDate);

    const existingSubscription = await prisma.userSubscription.findFirst({
      where: {
        userId: parseInt(userId),
        sub_status: 1,
      },
    });

    if (existingSubscription) {
      const currentPlan = await prisma.plan.findUnique({ where: { id: existingSubscription.planId } });
      const remainingDays = (new Date(existingSubscription.expired_at) - startDate) / (1000 * 60 * 60 * 24);
      const remainingValue = (remainingDays / currentPlan.plan_days) * parseFloat(currentPlan.amount);
      const newPlanPrice = parseFloat(plan.amount);

      if (newPlanPrice > parseFloat(currentPlan.amount)) {
        // Upgrade logic
        const creditDays = (remainingValue / newPlanPrice) * plan.plan_days;
        const totalDays = remainingDays + plan.plan_days * 30;
        expiredAt.setMonth(startDate.getMonth() + plan.plan_days);
        expiredAt.setDate(expiredAt.getDate() + remainingDays);

        await prisma.userSubscription.update({
          where: { id: existingSubscription.id },
          data: { sub_status: 0 },
        });

        await prisma.userSubscription.create({
          data: {
            planId: parseInt(planId),
            userId: parseInt(userId),
            start_date: startDate,
            expired_at: expiredAt,
            sub_status: 1, // Active status
            overlap_status: 0, // Default value
            refund_status: 0, // Default value
            overlap_date: expiredAt, // Assuming overlap date is the same as expiry date
          },
        });
      }
      return res.status(200).json({ received: true });
    }

    expiredAt.setMonth(startDate.getMonth() + plan.plan_days);
    await prisma.userSubscription.create({
      data: {
        planId: parseInt(planId),
        userId: parseInt(userId),
        start_date: startDate,
        expired_at: expiredAt,
        sub_status: 1, // Active status
        overlap_status: 0, // Default value
        refund_status: 0, // Default value
        overlap_date: expiredAt,
      },
    });

    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { promotedAssetCount: 0 },
    });
  }

  return res.status(200).json({ received: true });
});

app.use("/user/payment/stripewebhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Routes
app.use("/user", userRouter);
app.use("/user/payment", paymentRouter);
app.use("/chat", chatRouter);
app.use("/message", messageRouter);
app.use("/admin", adminRouter);
app.use("/notifications", notificationRouter);
app.use("/support", adminChatRouter);
app.use("/adminNotifications", adminNotificationRouter);

app.get("/reset-password", async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).send("Token is required");
  }
  const admin = await prisma.admin.findFirst({ where: { token } });
  if (!admin) {
    return res.status(400).send("Invalid or expired reset token");
  }
  return res.render("forgetPassword.ejs", { token, baseUrl: process.env.BASE_URL || "https://securpoint.app:4000" });
});

app.get("/test", (req, res) => {
  console.log("Domain is working properly ✅");
  res.send("Domain is working properly ✅");
});

// cron.schedule('*/1 * * * *', notifyAndExpirePromotions);
// cron.schedule('*/1 * * * *', notifyExpiringPlans);

initializeSocketIO(io);

// Network IP helper
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      const isV4 = net.family === "IPv4" || net.family === 4;
      if (isV4 && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

const PORT = process.env.PORT || 4000;

// Start Server & Connect Database
async function startServer() {
  let dbStatus = "Connecting...";
  try {
    await prisma.$connect();
    const dbUrl = process.env.DATABASE_URL || "";
    const dbNameMatch = dbUrl.match(/\/([^/?]+)(\?|$)/);
    const dbName = dbNameMatch ? dbNameMatch[1] : "MySQL";
    dbStatus = `Connected (${dbName})`;
  } catch (error) {
    dbStatus = `Failed: ${error.message}`;
    console.error("❌ Database connection error:", error.message);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    const networkAddrs = getNetworkAddresses();
    const networkIp = networkAddrs.length > 0 ? networkAddrs[0].address : null;

    console.log("\n" + "=".repeat(52));
    console.log("       🚀 SECURE POINT SERVER STARTED");
    console.log("=".repeat(52));
    console.log(`  Mode:        ${process.env.NODE_ENV || "development"}`);
    console.log(`  Local:       ${protocol}://localhost:${PORT}`);
    if (networkIp) {
      console.log(`  Network:     ${protocol}://${networkIp}:${PORT}`);
    }
    if (networkAddrs.length > 1) {
      networkAddrs.slice(1).forEach((addr) => {
        console.log(`  Network (${addr.name}): ${protocol}://${addr.address}:${PORT}`);
      });
    }
    console.log(`  Database:    🗄️  ${dbStatus}`);
    console.log(`  Socket.IO:   🔌 Initialized on port ${PORT}`);
    console.log(`  Protocol:    ${protocol.toUpperCase()}`);
    console.log("=".repeat(52) + "\n");
  });
}

startServer();

// Graceful Shutdown
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    httpServer.close(() => {
      console.log("👋 Server and database connections closed.");
      process.exit(0);
    });
  } catch (err) {
    process.exit(1);
  }
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
