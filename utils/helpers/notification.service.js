import admin from 'firebase-admin';
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import hbs from "nodemailer-express-handlebars";

dotenv.config();

/**
 * Send FCM Notification (modern method)
 * @param {string} token - Device FCM token
 * @param {object} message - { title: string, body: string }
 * @param {object} data - Custom key-value payload
 */
export const sendNotification = async ({
  toUserIds,
  title,
  content,
  data = {},
  byUserId = null,
  byAdminId = null,
  type = null,
  sendFCM = true, // new option
}) => {
  try {
    const ids = Array.isArray(toUserIds) ? toUserIds : [toUserIds];
 
    // 1. Insert notifications in DB
    await prisma.notification.createMany({
      data: ids.map(id => ({
        toUserId: id,
        title,
        content,
        data,
        byUserId,
        byAdminId,
        type,
      })),
    });
 
    // 2. Optionally send FCM
    if (sendFCM) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { fcm_token: true },
      });
 
      const tokens = users.map(u => u.fcm_token).filter(t => t);
 
      if (tokens.length > 0) {
       const response = await admin.messaging().sendMulticast({
          notification: { title, body: content },
          data: data,
          tokens,
        });
        console.log('Successfully sent message:', response);
      }
    }
 
    return { success: true };
  } catch (error) {
    console.error("Notification Error:", error);
    return { success: false, error: error.message };
  }
};


export async function createNormalNotificationForUser(params) {
    try {
        const data = {
            toUserId: params.toUserId,
            byAdminId: params.byAdminId,
            data: params.data,
            title: params.title,
            content: params.content,
            type: params.type
        }
        const notification = await prisma.notification.create({
            data: data
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

export async function createNormalNotificationForAdmin(params) {
    try {
        const data = {
            toAdminId: params.toAdminId,
            byUserId: params.byUserId,
            data: params.data,
            title: params.title,
            content: params.content,
            type: params.type
        }
        const notification = await prisma.adminNotification.create({
            data: data
        })
        console.log('inserted successfully');
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




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Setup transporter
const port = Number(process.env.SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: port,
  secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER || "secur.point26@gmail.com",
    pass: process.env.SMTP_PASS || "mvvx nquc zkll wdwi",
  },
  tls: {
    rejectUnauthorized: false
  }
});

// ✅ Handlebars config
const handlebarOptions = {
  viewEngine: {
    extname: ".handlebars",
    partialsDir: path.resolve(__dirname, "../../view/"),
    defaultLayout: false,
  },
  viewPath: path.resolve(__dirname, "../../view/"),
  extName: ".handlebars",
};

// Attach hbs to transporter
transporter.use("compile", hbs(handlebarOptions));

/**
 * Send an email with Handlebars template
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template filename (without extension)
 * @param {Object} options.context - Dynamic data for Handlebars
 */
export async function sendNotificationEmail({ to, subject, template = "mail_template", context }) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"Secure Point" <${process.env.SMTP_USER}>`,
      to,
      subject,
      template, // e.g. "mail_template"
      context : {...context,logo : process.env.LOGO_URL || "https://securpoint.co.uk:4000/mainLogo.png"},
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
}

// const templateData = {
//   subject: "Your profile has been deactivated",
//   title: "Profile Deactivated",
//   message: "Your profile has been deactivated by our team. You will not appear in searches until re-enabled.",
//   logo: "https://example.com/logo.png",
//   companyName: "SecurPoint",
//   href_url: "https://app.securpoint.com/support",
//   buttonText: "Contact Support",
//   supportEmail: "help@securpoint.com"
// };


