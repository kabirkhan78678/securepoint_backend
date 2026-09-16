// import jwt from 'jsonwebtoken';
// import { PrismaClient } from "@prisma/client";
// import dotenv from "dotenv";
// dotenv.config();
// const prisma = new PrismaClient();


// export async function adminAuth(req, res, next) {
//   try {
//     const header = req.headers.authorization;

//     const secretKey = process.env.SECRET_KEY;

//     if (!header) {
//       return res.status(401).json({
//         message: "Token Not Provided",
//         status: 400,
//         success: false,
//       });
//     }
//     const [bearer, token] = header.split(' ');
//     console.log(token);
//     console.log(secretKey);
//     // Verify the token
//     const decoded = jwt.verify(token, secretKey);
//     console.log(decoded);
//     const user = await prisma.admin.findUnique({
//       where: {
//         id: decoded.adminId,
//       },
//     })
//     if (user) {
//       req.user = user;
//       next();
//     }
//     else {
//       return res.status(403).json({
//         message: "Access Forbidden",
//         status: 401,
//         success: false,
//       });
//     }
//   } catch (error) {
//     return res.status(403).json({
//       message: "Access forbidden",
//       status: 401,
//       success: false,
//     });

//   }

// }

import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

/**
 * @param {string[]} allowedRoles 
 */
export function adminAuth(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      const secretKey = process.env.SECRET_KEY;

      if (!header) {
        return res.status(401).json({
          message: "Token Not Provided",
          status: 401,
          success: false,
        });
      }

      const [bearer, token] = header.split(" ");

      if (bearer !== "Bearer" || !token) {
        return res.status(401).json({
          message: "Invalid Authorization Header",
          status: 401,
          success: false,
        });
      }

      const decoded = jwt.verify(token, secretKey);
      console.log("Decoded token:", decoded);

      const user = await prisma.admin.findUnique({
        where: { id: decoded.adminId },
        select: { id: true, full_name: true, email: true, role: true },
      });

      console.log("User from DB:", user); 

      if (!user) {
        return res.status(403).json({
          message: "Admin not found",
          status: 403,
          success: false,
        });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          message: "Access Denied: Insufficient Role",
          status: 403,
          success: false,
        });
      }
      console.log("Allowed roles:", allowedRoles);

      req.user = user;
      next();
    } catch (error) {
      console.error("Auth error:", error.message);
      return res.status(403).json({
        message: "Access forbidden",
        status: 403,
        success: false,
      });
    }
  };
}
