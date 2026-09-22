import Joi from "joi";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import message from "../utils/messages.js";
import { randomStringAsBase64Url } from "../utils/helper.js";
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import path from 'path'
import hbs from "nodemailer-express-handlebars";
import localStorage from 'localStorage'
import { createNormalNotificationForUser, sendNotificationRelateToAppToUser } from "../utils/notification.js";
import { sendNotificationEmail, createNormalNotificationForAdmin, sendNotification } from "../utils/helpers/notification.service.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
const baseurl = process.env.BASE_URL;

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("⚠️ SMTP Connection Error:", error.message);
  }
});
// var transporter = nodemailer.createTransport({
//   // service: 'gmail',
//   host: "smtp.gmail.com",
//   port: 587,
//   // secure: true,
//   auth: {
//     user: "yashraj.ctinfotech@gmail.com",
//     pass: "lggh qqgx fkuc efwq",
//   },
// });

const handlebarOptions = {
  viewEngine: {
    partialsDir: path.resolve(__dirname, "../view/"),
    defaultLayout: false,
  },
  viewPath: path.resolve(__dirname, "../view/"),
};
transporter.use("compile", hbs(handlebarOptions));
export async function login(req, res) {
  try {
    const secretKey = process.env.SECRET_KEY;
    const { email, password, fcm_token } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        //email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
        email: Joi.string()
          .min(5)
          .max(255)
          .email({ tlds: { allow: false } })
          .lowercase()
          .required(),
        password: Joi.string().min(8).max(64).required().messages({
          "any.required": "{{#label}} is required!!",
          "string.empty": "can't be empty!!",
          "string.min": "minimum 8 value required",
          "string.max": "maximum 64 values allowed",
        }),
        fcm_token: Joi.string().optional(),
      })
    );
    const result = schema.validate({ email, password, fcm_token });

    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    } else {
      const user = await prisma.admin.findUnique({
        where: {
          email: email,
        },
      });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid credentials",
          status: 400,
        });
      }
      // if (user.isVerified === false) {
      //     return res.status(400).json({
      //         message: "Please verify your account",
      //         status: 400,
      //         success: false
      //     })
      // }
      if (fcm_token) {
        await prisma.admin.update({
          where: {
            email: email,
          },
          data: {
            fcm_token: fcm_token,
          },
        });
      }

      // const userData = await prisma.admin.findUnique({
      //   where: {
      //     email: email,
      //   },
      //    where: { role: 'SUBADMIN' },
      // orderBy: { id: 'desc' },
      // include: { Permission: { include: { feature: true } } }
      // });

      const userData = await prisma.admin.findUnique({
        where: { email }
      });

      let result = userData;

      if (userData?.role === 'SUBADMIN') {
        result = await prisma.admin.findUnique({
          where: { email },
          include: {
            Permission: {
              include: { feature: true }
            }
          }
        });
      }

      const token = jwt.sign(
        { adminId: user.id, role: user.role, email: user.email },
        secretKey,
        { expiresIn: "3d" }
      );
      return res.json({
        status: 200,
        success: true,
        message: "Login successful!",
        token: token,
        admin: result,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function passwordChange(req, res) {
  try {
    const { currPassword, newPassword } = req.body;

    const schema = Joi.alternatives(
      Joi.object({
        //email: Joi.string().min(5).max(255).email({ tlds: { allow: false } }).lowercase().required(),
        currPassword: Joi.string().min(8).required().messages({
          "any.required": "{{#label}} is required!!",
          "string.empty": "can't be empty!!",
          "string.min": "minimum 8 value required",
          "string.max": "maximum 15 values allowed",
        }),

        newPassword: Joi.string().min(8).required().messages({
          "any.required": "{{#label}} is required!!",
          "string.empty": "can't be empty!!",
          "string.min": "minimum 8 value required",
          "string.max": "maximum 15 values allowed",
        }),
      })
    );
    const result = schema.validate({ currPassword, newPassword });

    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    } else {
      const admin = await prisma.admin.findUnique({
        where: {
          id: req.user.id,
        },
      });

      if (!admin || !(await bcrypt.compare(currPassword, admin.password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid credentials",
          status: 400,
        });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.admin.update({
        where: {
          id: req.user.id,
        },
        data: {
          password: hashedPassword,
        },
      });

      return res.json({
        status: 200,
        success: true,
        message: "Password changed successfully",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

// export async function dashBoard(req, res) {
//   try {

//     const currentDate = new Date();

//     // Start of tomorrow in UTC
//     const startOfToday = new Date(Date.UTC(
//       currentDate.getUTCFullYear(),
//       currentDate.getUTCMonth(),
//       currentDate.getUTCDate(),
//       0, 0, 0, 0
//     ));

//     console.log('startdate', startOfToday)

//     const users = await prisma.user.findMany({
//       where: {
//         createdAt: {
//           gte: startOfToday
//         }
//       },
//       orderBy: {
//         createdAt: "desc",
//       },
//     });
//     const totalUsers = await prisma.user.count({
//       where:{

//       }
//     });
//     const formattedUsers = users.map((user) => ({
//       ...user,
//       avatar_url: user.avatar_url
//         ? `${baseurl}/images/${user.avatar_url}`
//         : null,
//     }));

//     const newSubscriptionCount = await prisma.userSubscription.count({
//       where: {
//         start_date: {
//           gte: startOfToday
//         },
//         sub_status: 1
//       }
//     });

//     const totalSales = await prisma.userSubscription.findMany({
//       where: {
//         expired_at: {
//           gte: startOfToday
//         },
//         sub_status: 1
//       },
//       include: {
//         plan: true
//       }
//     });
//     let salesAmount = 0
//     await Promise.all(totalSales.map((sales) => {
//       salesAmount += parseInt(sales.plan.amount)
//     }))
//     const newAssetPromoted = await prisma.asset.count({
//       where: {
//         promote: {
//           not: 0
//         },
//         updatedAt: {
//           gte: startOfToday
//         }
//       }
//     })
//     const totalAssetPromoted = await prisma.asset.count({
//       where: {
//         promote: {
//           not: 0
//         },
//       }
//     })
//     return res.json({
//       status: 200,
//       success: true,
//       message: "All users data",
//       newUsers: formattedUsers.length,
//       salesAmount,
//       newAssetPromoted, newSubscriptionCount, totalAssetPromoted,
//       data: formattedUsers,
//     });
//   } catch (error) {
//     console.log(error);
//     return res.json({
//       success: false,
//       message: "Internal Server Error",
//       status: 500,
//       error: error,
//     });
//   }
// }

export async function dashBoard(req, res) {
  try {

    const currentDate = new Date();

    // Start of tomorrow in UTC
    const startOfToday = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      0, 0, 0, 0
    ));

    console.log('startdate', startOfToday)

    // const users = await prisma.user.findMany({
    //   where: {
    //     createdAt: {
    //       gte: startOfToday
    //     }
    //   },
    //   orderBy: {
    //     createdAt: "desc",
    //   },
    // });
    const totalUsers = await prisma.user.count({
      // where: {
      //   isVerified: true
      // }

    });
    // const formattedUsers = users.map((user) => ({
    //   ...user,
    //   avatar_url: user.avatar_url
    //     ? `${baseurl}/images/${user.avatar_url}`
    //     : null,
    // }));

    const newSubscriptionCount = await prisma.userSubscription.count({
      where: {
        start_date: {
          gte: startOfToday
        },
        sub_status: 1
      }
    });
    const totalSubscriptionCount = await prisma.userSubscription.count({
    });

    const totalSales = await prisma.userSubscription.findMany({
      where: {
        // expired_at: {
        //   gte: startOfToday
        // },
        // sub_status: 1
      },
      include: {
        plan: true
      }
    });
    let salesAmount = 0
    await Promise.all(totalSales.map((sales) => {
      salesAmount += parseInt(sales.plan.amount)
    }))
    const newAssetPromoted = await prisma.asset.count({
      where: {
        promote: {
          not: 0
        },
        updatedAt: {
          gte: startOfToday
        }
      }
    })
    const totalAssetPromoted = await prisma.asset.count({
      where: {
        promote: {
          not: 0
        },
      }
    })

    const reportAssets = await prisma.reportAsset.groupBy({
      by: ['assetId'],
      _count: {
        assetId: true,
      },
    });

    // Count distinct user IDs
    const reportUser = await prisma.reportUser.groupBy({
      by: ['reportedToUserId'],
      _count: {
        reportedToUserId: true,
      },
    });

    const reportedAssetCount = reportAssets.length;
    const reportedUserCount = reportUser.length;

    return res.json({
      status: 200,
      success: true,
      message: "All users data",
      // newUsers: formattedUsers.length,
      salesAmount,
      newAssetPromoted, newSubscriptionCount, totalAssetPromoted, totalUsers, totalSubscriptionCount, reportedAssetCount, reportedUserCount
      // data: formattedUsers,
    });
  } catch (error) {
    console.log(error);
    return res.json({
      success: false,
      message: message.err,
      status: 500,
      error: error,
    });
  }
}

export async function getAllUsers(req, res) {
  try {

    const currentDate = new Date();

    // Start of tomorrow in UTC
    const startOfToday = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      0, 0, 0, 0
    ));
    const { search, page = 1, limit = 10 } = req.query;
    const users = await prisma.user.findMany({
      where: {
        full_name: {
          contains: search
        }
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    await Promise.all(users.map(async (user) => {
      if (user.avatar_url) {
        user.avatar_url = `${baseurl}/images/${user.avatar_url}`
      }
      const userSubscription = await prisma.userSubscription.findFirst({
        where: {
          userId: user.id,
          expired_at: {
            gte: startOfToday
          },
          sub_status: 1
        }
      })
      if (userSubscription) {
        user.hasPremium = true
      }
      else {
        user.hasPremium = false
      }
    }));

    const totalUsers = await prisma.user.count({})



    return res.json({
      status: 200,
      success: true,
      message: "All users data",
      count: totalUsers,
      data: users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function getAllAssets(req, res) {
  try {
    const { search, status, date, promote, page = 1, limit = 10 } = req.query;
    const filterQuery = {
      ...(status && { status }),  // Filter by status if present
      ...(promote !== null && promote !== undefined && {
        promote: parseInt(promote) === 0 ? 0 : { not: 0 }
      }),  // Filter by promote if present and parsed correctly
      ...(date && {
        createdAt: {
          gte: new Date(new Date(date).setUTCHours(0, 0, 0, 0)),  // Start of the given date
          lte: new Date(new Date(date).setUTCHours(23, 59, 59, 999))  // End of the given date
        }
      }),
      ...(search && {
        OR: [
          { AssetName: { contains: search, } },  // Case insensitive search in AssetName
          { AssetIdentifier: { contains: search, } },
          { UIC: { contains: search, } }  // Case insensitive search in UIC
        ]
      }),
    };

    const assets = await prisma.asset.findMany({
      where: filterQuery,
      include: {
        AssetImages: true,
        user: true
      },
      orderBy: {
        promote: 'desc'
      },
      //skip: parseInt((page - 1) * limit), take: parseInt(limit)
    })

    await Promise.all(assets.map(async (asset) => {
      if (asset.AssetImages) {
        for (let i = 0; i < asset.AssetImages.length; i++) {
          asset.AssetImages[i].image_url = `${baseurl}/images/${asset.AssetImages[i].image_url}`
        }
      }
      if (asset.user.avatar_url) {
        asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`
      }
      return asset
    }))

    const count = await prisma.asset.count({
      where: filterQuery
    })

    return res.status(200).json({
      status: 200,
      message: 'Assets',
      success: true,
      assets,
      count

    })
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}

export async function getAllCategory(req, res) {
  try {
    const { search } = req.query
    const categoryList = await prisma.category.findMany({
      where: {
        categoryName: {
          contains: search
        }
      },
      orderBy: [
        {
          display_order: 'asc'
        },
        {
          id: 'asc'
        }
      ]
    });
    console.log(categoryList);
    const formattedCategories = categoryList.map((category) => ({
      ...category,
      categoryImage: category.categoryImage
        ? `${baseurl}/images/${category.categoryImage}`
        : null,
    }));

    return res.json({
      status: 200,
      success: true,
      message: "All Categories data",
      data: formattedCategories,
      count: formattedCategories.length,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function getAllSubCategory(req, res) {
  try {
    const { search } = req.query
    const categoryList = await prisma.subCategory.findMany({
      where: {
        subCategory: search
      },
      include: {
        category: true
      },
      orderBy: {
        id: 'desc'
      }
    });

    await Promise.all(categoryList.map((category) => {
      if (category.category.categoryImage) {
        category.category.categoryImage = `${baseurl}/images/${category.category.categoryImage}`
      }
    }))

    return res.json({
      status: 200,
      success: true,
      message: "All Sub-Categories ",
      data: categoryList,
      count: categoryList.length,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function reorderCategories(req, res) {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "Invalid or empty categories list",
      });
    }

    const schema = Joi.array().items(
      Joi.object({
        id: Joi.number().integer().positive().required(),
        display_order: Joi.number().integer().positive().required(),
      })
    ).min(1).required();

    const { error } = schema.validate(categories);
    if (error) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: error.details[0].message,
      });
    }

    // Check for duplicate IDs and duplicate display_order values
    const idSet = new Set();
    const orderSet = new Set();

    for (const item of categories) {
      if (idSet.has(item.id)) {
        return res.status(400).json({
          status: 400,
          success: false,
          message: `Duplicate category ID detected: ${item.id}`,
        });
      }
      idSet.add(item.id);

      if (orderSet.has(item.display_order)) {
        return res.status(400).json({
          status: 400,
          success: false,
          message: `Duplicate display_order detected: ${item.display_order}`,
        });
      }
      orderSet.add(item.display_order);
    }

    // Verify all category IDs exist in DB
    const categoryIds = categories.map((c) => parseInt(c.id));
    const existingCount = await prisma.category.count({
      where: {
        id: { in: categoryIds },
      },
    });

    if (existingCount !== categoryIds.length) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "One or more category IDs are invalid or do not exist",
      });
    }

    // Execute atomic update inside database transaction
    await prisma.$transaction(
      categories.map((cat) =>
        prisma.category.update({
          where: { id: parseInt(cat.id) },
          data: { display_order: parseInt(cat.display_order) },
        })
      )
    );

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Categories reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering categories:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error.message || error,
    });
  }
}

export async function addCategory(req, res) {
  try {
    const { categoryName } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        categoryName: Joi.string().required(),
      })
    );
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

    const category = await prisma.category.findFirst({
      where: {
        categoryName: categoryName
      }
    })
    if (category) {
      return res.json({
        status: 400,
        success: true,
        message: "Category with this name already exists",
      });
    }

    const maxOrderCategory = await prisma.category.findFirst({
      orderBy: { display_order: 'desc' }
    });
    const nextDisplayOrder = (maxOrderCategory?.display_order || 0) + 1;

    const addCategory = await prisma.category.create({
      data: {
        categoryName: categoryName,
        categoryImage: req.file && req.file.filename ? req.file.filename : null,
        display_order: nextDisplayOrder,
      },
    });
    return res.json({
      status: 200,
      success: true,
      message: "Category added successfully",
      data: addCategory,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function addSubCategory(req, res) {
  try {
    const { subCategory, categoryId } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        subCategory: Joi.string().required(),
        categoryId: Joi.number().required(),
      })
    );
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
    const subCategoryData = await prisma.subCategory.findFirst({
      where: {
        subCategory: subCategory,
        categoryId: parseInt(categoryId),
      }
    })
    if (subCategoryData) {
      return res.json({
        status: 400,
        success: true,
        message: "Sub Category with this name already exists",
      });
    }
    await prisma.subCategory.create({
      data: {
        subCategory: subCategory,
        categoryId: parseInt(categoryId),
      },
    });

    return res.status(200).json({
      status: 200,
      message: "Sub-Category added successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function updateCategory(req, res) {
  try {
    const { id, categoryName } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        categoryName: Joi.string().optional(),
        id: Joi.string().required()
      })
    );
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

    if (categoryName) {
      const categoryData = await prisma.category.findFirst({
        where: {
          id: {
            not: parseInt(id)
          },
          categoryName: categoryName
        }
      });
      if (categoryData) {
        return res.json({
          status: 400,
          success: true,
          message: "Category with this name already exists",
        });
      }
      await prisma.category.update({
        where: {
          id: parseInt(id),
        },
        data: {
          categoryName: categoryName,
        },
      });
    }

    if (req.file && req.file.filename) {
      await prisma.category.update({
        where: {
          id: parseInt(id),
        },
        data: {
          categoryImage: req.file.filename,
        },
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Category updated successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function updateSubCategory(req, res) {
  try {
    const { id, subCategory, categoryId } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        id: Joi.number().required(),
        subCategory: Joi.string().optional(),
        categoryId: Joi.number().optional(),
      })
    );
    const result = schema.validate({ subCategory, categoryId, id });
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
    const subCategoryDetail = await prisma.subCategory.findUnique({
      where: {
        id: parseInt(id)
      }
    });
    if (subCategory) {


      const subCategoryData = await prisma.subCategory.findFirst({
        where: {
          id: {
            not: parseInt(id)
          },
          subCategory: subCategory,
          categoryId: subCategoryDetail.categoryId
        }
      })
      if (subCategoryData) {
        return res.json({
          status: 400,
          success: true,
          message: "Sub Category with this name already exists",
        });
      }
      await prisma.subCategory.update({
        where: {
          id: parseInt(id),
        },
        data: {
          subCategory: subCategory,
        },
      });
    }

    if (categoryId) {

      const existedCategory = await prisma.subCategory.findFirst({
        where: {
          subCategory: subCategoryDetail.subCategory,
          categoryId: parseInt(categoryId)
        }
      })
      if (existedCategory) {
        return res.json({
          status: 400,
          success: true,
          message: "Sub Category with this name already exists",
        });
      }

      await prisma.subCategory.update({
        where: {
          id: parseInt(id),
        },
        data: {
          categoryId: parseInt(categoryId),
        },
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Sub-Category updated successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function deleteCategory(req, res) {
  try {
    let { categoryId } = req.params;

    categoryId = parseInt(categoryId)

    await prisma.category.delete({
      where: {
        id: categoryId
      }
    })
    return res.status(200).json({
      status: 200,
      message: 'Category deleted successfully',
      success: true,
    })


  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}

export async function deleteSubCategory(req, res) {
  try {
    let { subcategoryId } = req.params;

    subcategoryId = parseInt(subcategoryId)

    await prisma.subCategory.delete({
      where: {
        id: subcategoryId
      }
    })
    return res.status(200).json({
      status: 200,
      message: 'Sub-Category deleted successfully',
      success: true,
    })


  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}

// export async function reportedAssets(req, res) {
//   try {
//     const reportedAssets = await prisma.reportAsset.findMany({
//       include: {
//         user: true,
//         asset: {
//           include: {
//             AssetImages: true
//           }
//         }
//       },
//       orderBy: {
//         id: 'desc'
//       }
//     });

//     await Promise.all(reportedAssets.map((reportAsset) => {

//       if (reportAsset.asset.AssetImages) {
//         for (let i = 0; i < reportAsset.asset.AssetImages.length; i++) {
//           reportAsset.asset.AssetImages[i].image_url = `${baseurl}/images/${reportAsset.asset.AssetImages[i].image_url}`
//         }
//       }
//       if (reportAsset.user.avatar_url) {
//         reportAsset.user.avatar_url = `${baseurl}/images/${reportAsset.user.avatar_url}`
//       }
//       return reportAsset

//     }))
//     return res.status(200).json({
//       status: 200,
//       message: 'Reported Assets ',
//       success: true,
//       reportedAssets,
//       count: reportedAssets.length
//     })

//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({
//       status: 500,
//       message: 'Internal Server Error',
//       success: false,
//       error: error
//     })

//   }
// }

export async function reportedProfiles(req, res) {
  try {

    const reportProfiles = await prisma.reportUser.findMany({
      include: {
        reportedTo: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    await Promise.all(reportProfiles.map(async (reportProfile) => {
      if (reportProfile.reportedTo.avatar_url) {
        reportProfile.reportedTo.avatar_url = `${baseurl}/images/${reportProfile.reportedTo.avatar_url}`
      }
      const reportedBy = await prisma.user.findUnique({
        where: {
          id: reportProfile.reportedByUserId
        }
      })
      if (reportedBy.avatar_url) {
        reportedBy.avatar_url = `${baseurl}/images/${reportedBy.avatar_url}`
      }
      reportProfile.reportedByUser = reportedBy

      return reportProfile
    }))
    return res.status(200).json({
      status: 200,
      message: 'Reported Profiles ',
      success: true,
      reportProfiles,
      count: reportProfiles.length
    })
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })
  }
}

export async function deleteAsset(req, res) {
  try {
    let { id } = req.params;

    id = parseInt(id);

    const asset = await prisma.asset.findUnique({
      where: {
        id: id,
      }
    })

    if (!asset) {
      return res.status(400).json({
        status: 200,
        message: 'Asset not found ',
        success: true,
      })
    }

    await prisma.asset.delete({
      where: {
        id: id,
      }
    })
    return res.status(200).json({
      status: 200,
      message: 'Asset deleted successfully',
      success: true,
    })

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}

export async function deleteAccount(req, res) {
  try {
    let { id } = req.params;

    id = parseInt(id);


    const user = await prisma.user.findUnique({
      where: {
        id: id
      }
    })
    if (!user) {
      return res.status(400).json({
        status: 400,
        message: 'User Not Found',
        success: false,
      })
    }
    await prisma.chat.deleteMany({
      where: {
        participants: {
          some: {
            id: user.id
          }
        }
      }
    });

    await prisma.reportUser.deleteMany({
      where: {
        reportedByUserId: id
      }
    })

    await prisma.user.delete({
      where: {
        id: id
      }
    })

    await sendNotificationEmail({
      to: user.email,
      subject: "Account Deactivated",
      template: "mail_template",
      context: {
        title: "Account Deactivated",
        message: "Your account has been deleted/deactivated by our team. If this wasn't you, please contact support immediately."
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Account deleted successfully."
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function reviewRequest(req, res) {
  try {
    let { requestId, action } = req.body;

    const schema = Joi.object({
      requestId: Joi.number().required(),
      action: Joi.string().valid("Approved", "Rejected").required()
    });

    requestId = parseInt(requestId);

    const result = schema.validate(req.body);
    if (result.error) {
      const message = result.error.details.map((i) => i.message).join(",");
      return res.status(400).json({
        message: result.error.details[0].message,
        error: message,
        missingParams: result.error.details[0].message,
        status: 400,
        success: false,
      });
    }

    const request = await prisma.userUpdateRequests.findUnique({ where: { id: requestId } });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found.", status: 404 });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        status: 400,
        success: false,
        message: `Request already ${request.status}.`
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: request.userId
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found.", status: 404 });
    }

    if (action === "Approved") {
      if (request.newEmail) {
        const normalizedEmail = request.newEmail.trim().toLowerCase();
        const existingUser = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            id: {
              not: request.userId
            }
          }
        });
        if (existingUser) {
          return res.status(400).json({ status: 400, success: false, message: "Email already in use." });
        }
      }

      if (request.newPhone) {
        const normalizedPhone = request.newPhone.trim();
        const existingUser = await prisma.user.findFirst({
          where: {
            phone_no: normalizedPhone,
            id: {
              not: request.userId
            }
          }
        });
        if (existingUser) {
          return res.status(400).json({ status: 400, success: false, message: "Phone number already in use." });
        }
      }

      await prisma.user.update({
        where: { id: request.userId },
        data: {
          email: request.newEmail ? request.newEmail.trim().toLowerCase() : user.email,
          phone_no: request.newPhone ? request.newPhone.trim() : user.phone_no
        }
      });
    }

    await prisma.userUpdateRequests.update({
      where: {
        id: requestId
      },
      data: {
        status: action
      }
    });

    await sendNotificationEmail({
      to: user.email,
      subject: `Email/Phone update ${action}`,
      template: "mail_template",
      context: {
        title: `Email/Phone update ${action}`,
        message: action === "Approved"
          ? "Your email/phone update request has been approved."
          : "Your email/phone update request has been rejected."
      },
    });

    return res.status(200).json({ status: 200, success: true, message: `Request ${action} successfully.` });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      success: false,
      error: error,
    });
  }
}

export async function getReviewRequests(req, res) {
  try {
    const requests = await prisma.userUpdateRequests.findMany({
      where: { status: "Pending" }, include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return res.status(200).json({ status: 200, success: true, data: requests });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}

export async function reportedAssets(req, res) {
  try {
    const reportedAssets = await prisma.asset.findMany({
      where: { reviewStatus: { not: null } },
      include: {
        ReportAsset: {
          include: {
            user: true,
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        category: true,
        subCategory: true,
        AssetImages: true,
        user: true,
      },
      orderBy: { id: 'desc' },
    });

    reportedAssets.forEach((asset) => {
      asset.ReportAsset.forEach((report) => {
        if (report.user.avatar_url) {
          report.user.avatar_url = `${baseurl}/images/${report.user.avatar_url}`;
        }
      });

      if (asset.AssetImages.length > 0) {
        asset.AssetImages.forEach((img) => {
          img.image_url = `${baseurl}/images/${img.image_url}`;
        });
      }

      if (asset.user.avatar_url) {
        asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`;
      }
    });

    return res.status(200).json({
      status: 200,
      message: 'Reported Assets',
      success: true,
      reportedAssets,
      count: reportedAssets.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error,
    });
  }
}

export async function sendAdminFeedback(req, res) {
  try {
    let { assetId, feedback } = req.body;

    const schema = Joi.object({
      assetId: Joi.number().required(),
      feedback: Joi.string().required()
    });

    assetId = parseInt(assetId)

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

    const asset = await prisma.asset.update({
      where: { id: assetId },
      include: {
        user: true
      },
      data: {
        reviewStatus: 1, // Awaiting user feedback
        adminFeedback: feedback,
      },
    });

    const admin = await prisma.admin.findMany();

    await createNormalNotificationForUser({
      toUserId: asset.userId,
      title: "Asset Resolution",
      byAdminId: admin[0].id,
      data: {},
      type: "Admin_Feebback",
      content: feedback
    })
    await sendNotificationRelateToAppToUser({
      token: asset.user.fcm_token,
      title: "Asset Resolution",
      toUserId: asset.userId,
      body: feedback,
      data: {},
      type: "Admin_Feebback",
    })



    return res.status(200).json({
      status: 200,
      message: ' Feedback sent successfully to asset owner .',
      success: true,
      asset,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error,
    });
  }
}

export async function sendNotificationToUsersBulk(req, res) {
  try {
    const { title, body } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        title: Joi.string().required(),
        body: Joi.string().required(),
      })
    );
    console.log(req.body);
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

    const users = await prisma.user.findMany({
    });
    console.log(">>>>>>", users.length)
    const admin = await prisma.admin.findMany();
    await Promise.all(users.map(async (user) => {
      await createNormalNotificationForUser({
        toUserId: user.id,
        title: title,
        byAdminId: admin[0].id,
        data: {},
        type: "Bulk_Notification",
        content: body
      })
      await sendNotificationRelateToAppToUser({
        token: user.fcm_token,
        title: title,
        toUserId: user.id,
        body: body,
        data: {},
        type: "Bulk_Notification",
      })
    }))
    return res.status(200).json({
      status: 200,
      message: 'Notification Sent Successfully to all users',
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

export async function sendNotificationToUser(req, res) {
  try {
    const { title, body, userId } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        title: Joi.string().required(),
        body: Joi.string().required(),
        userId: Joi.number().integer().required(),
      })
    );
    console.log(req.body);
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

    const user = await prisma.user.findUnique({
      where: {
        id: parseInt(userId)
      }
    });
    const admin = await prisma.admin.findMany();
    await createNormalNotificationForUser({
      toUserId: user.id,
      title: title,
      byAdminId: admin[0].id,
      data: {},
      type: "Single_Notification",
      content: body
    })
    await sendNotificationRelateToAppToUser({
      token: user.fcm_token,
      title: title,
      toUserId: user.id,
      body: body,
      data: {},
      type: "Single_Notification",
    })
    return res.status(200).json({
      status: 200,
      message: 'Notification sent successfully.',
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

export async function updatePlan(req, res) {
  try {
    const { planId, amount, ngn, usd, inr, gbp } = req.body;
    const schema = Joi.alternatives(
      Joi.object({
        planId: Joi.number().integer().required(),
        inr: Joi.number().precision(2).optional(),
        ngn: Joi.number().precision(2).optional(),
        usd: Joi.number().precision(2).optional(),
        gbp: Joi.number().precision(2).optional(),
        amount: Joi.number().precision(2).optional(),
      })
    );
    console.log(req.body);
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
    const plan = await prisma.plan.findUnique({
      where: {
        id: parseInt(planId)
      }
    })
    if (!plan) {
      return res.status(404).json({
        status: 404,
        message: 'Plan Not Found',
        success: false,
      })
    }
    await prisma.plan.update({
      where: {
        id: parseInt(planId)
      }
      , data: {
        inr: inr ? inr : plan.inr,
        ngn: ngn ? ngn : plan.ngn,
        usd: usd ? usd : plan.usd,
        amount: amount ? amount : plan.amount,
        gbp: gbp ? gbp : plan.gbp
      }
    })
    return res.status(200).json({
      status: 200,
      success: true,
      message: 'Plan Updated Successfully',
      success: true,
    })
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error
    })

  }
}
export const updatecms = async (req, res) => {
  const {
    type,
    content
  } = req.body;

  const schema = Joi.object({
    type: Joi.string().valid('PRIVACY', 'TERMS').required(),
    content: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    const message = error.details.map((i) => i.message).join(", ");
    return res.status(400).json({
      message: message,
      missingParams: error.details[0].message,
      status: 400,
      success: false,
    });
  }

  try {
    const cms = await prisma.termsAndPrivacy.update({
      where: { type: type },
      data: {
        content: content,
      },
    });

    const message = type == "PRIVACY" ? "Privacy Policy Updated Successfully " : "Terms of Service Updated Successfully"

    return res.status(200).json({
      status: 200,
      success: true,
      message: message,
      data: cms,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error.message,
    });
  }
};

export const getcms = async (req, res) => {
  try {
    const {
      type,
    } = req.body;

    const schema = Joi.object({
      type: Joi.string().valid('PRIVACY', 'TERMS').required(),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      const message = error.details.map((i) => i.message).join(", ");
      return res.status(400).json({
        message: message,
        missingParams: error.details[0].message,
        status: 400,
        success: false,
      });
    }
    const data = await prisma.termsAndPrivacy.findFirst({
      where: {
        type: type
      }
    });

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Blogs',
      data
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      status: error,
      message: 'Internal Server Error',
      error: error
    });
  }
}


export const updateLabel = async (req, res) => {
  const {
    type,
    content
  } = req.body;

  const schema = Joi.object({
    type: Joi.string().valid('MONITOR', 'LOCK', 'PROMOTE', 'ASSET').required(),
    content: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    const message = error.details.map((i) => i.message).join(", ");
    return res.status(400).json({
      message: message,
      missingParams: error.details[0].message,
      status: 400,
      success: false,
    });
  }

  try {
    const cms = await prisma.label.update({
      where: { type: type },
      data: {
        content: content,
      },
    });
    const message = type == "ASSET" ? "Promoted Asset Content Updated Successfully " : "Label Content Updated Successfully"
    return res.status(200).json({
      status: 200,
      message: message,
      success: true,
      data: cms,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: 'Internal Server Error',
      success: false,
      error: error.message,
    });
  }
};

export const getLabels = async (req, res) => {
  try {

    const data = await prisma.label.findMany({
    });

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Lables',
      data
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      status: error,
      message: 'Internal Server Error',
      error: error
    });
  }
}


// ================== CREATE ADMIN ==================
export const createAdmin = async (req, res) => {
  try {
    const { email, password, features, phone_no, role, full_name } = req.body;

    const adminsEmail = await prisma.admin.findUnique({
      where: { email: email },
    });

    const adminsPhone = await prisma.admin.findFirst({
      where: { phone_no: phone_no },
    });

    if (adminsEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (adminsPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const subAdmin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
        phone_no,
        role,
        full_name,
        Permission: {
          create: features.map((featureId) => ({
            featureId
          }))
        }
      },
      include: {
        Permission: { include: { feature: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: "Sub-admin created successfully",
      data: subAdmin
    });
  } catch (error) {
    console.error("Create SubAdmin Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ================== GET ALL ADMINS ==================
export async function getAdmins(req, res) {
  try {

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        status: 403,
        success: false,
        message: "Only Admin can view all Admins",
      });
    }

    const admins = await prisma.admin.findMany({
      where: { role: 'SUBADMIN' },
      orderBy: { id: 'desc' },
      include: { Permission: { include: { feature: true } } }
    });

    return res.json({
      status: 200,
      success: true,
      message: "SubAdmin Fetched Successfully",
      data: admins,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Internal Server Error",
      error,
    });
  }
}


// ================== UPDATE ADMIN ==================
export const updateAdmin = async (req, res) => {
  try {
    // const { id } = req.params;
    const { email, password, features, phone_no, role, id } = req.body;

    const existingAdmin = await prisma.admin.findUnique({
      where: { id: Number(id) },
      include: { Permission: true }
    });

    if (!existingAdmin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const adminsPhone = await prisma.admin.findFirst({
      where: {
        phone_no: phone_no,
        NOT: {
          id: Number(id),   // id you want to exclude
        }
      },
    });

    if (adminsPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }


    let hashedPassword = existingAdmin.password;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: Number(id) },
      data: {
        email,
        password: hashedPassword,
        phone_no,
        role,
        Permission: {
          deleteMany: {},
          create: features?.map((featureId) => ({
            featureId: Number(featureId)
          })) || []
        }
      },
      include: {
        Permission: { include: { feature: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    console.error("Update Admin Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================== DELETE ADMIN ==================
export async function deleteAdmin(req, res) {
  try {
    const { id } = req.params;

    const admin = await prisma.admin.findUnique({ where: { id: parseInt(id) } });
    if (!admin) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Admin Not Found",
      });
    }

    // // ✅ Only SuperAdmin can delete another Admin
    // if (req.user.role !== "SUBADMIN") {
    //   return res.status(403).json({
    //     status: 403,
    //     success: false,
    //     message: "Only SuperAdmin can delete Admins",
    //   });
    // }

    await prisma.admin.delete({ where: { id: parseInt(id) } });

    return res.json({
      status: 200,
      success: true,
      message: "Admin Deleted Successfully",
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Internal Server Error",
      error,
    });
  }
}


export const getFeatures = async (req, res) => {
  try {
    const features = await prisma.feature.findMany({
      include: {
        permissions: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    const filteredFeatures = features.filter(
      (f) => f.name && f.name.trim().toLowerCase() !== 'dashboard'
    );

    res.status(200).json({
      success: true,
      status: 200,
      message: 'Labels',
      features: filteredFeatures,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      status: 500,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
};

export async function privacyPolicy(req, res) {
  res.sendFile(path.join(__dirname, '../view/privacy.html'));
}

export async function getAllContactUs(req, res) {
  try {
    const data = await prisma.contactUs.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Contact-Us submissions fetched successfully.",
      data,
      count: data.length,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Internal Server Error",
      error,
    });
  }
}

// Missing adminRouter exports (restored)

export async function getUserById(req, res) {
  try {
    const userId = Number.parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid userId" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ status: 404, success: false, message: "User not found" });
    }

    if (user.avatar_url) user.avatar_url = `${baseurl}/images/${user.avatar_url}`;

    return res.status(200).json({ status: 200, success: true, message: "User fetched successfully", data: user });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getSingleAsset(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid asset id" });
    }

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        AssetImages: true,
        category: true,
        subCategory: true,
        user: true,
      },
    });

    if (!asset) {
      return res.status(404).json({ status: 404, success: false, message: "Asset not found" });
    }

    if (asset.AssetImages?.length) {
      asset.AssetImages = asset.AssetImages.map((img) => ({
        ...img,
        image_url: img.image_url ? `${baseurl}/images/${img.image_url}` : null,
      }));
    }
    if (asset.user?.avatar_url) asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`;

    return res.status(200).json({ status: 200, success: true, message: "Asset fetched successfully", data: asset });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getSingleCategory(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid category id" });
    }

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return res.status(404).json({ status: 404, success: false, message: "Category not found" });
    }

    if (category.categoryImage) category.categoryImage = `${baseurl}/images/${category.categoryImage}`;

    return res.status(200).json({ status: 200, success: true, message: "Category fetched successfully", data: category });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getSingleSubCategory(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid subCategory id" });
    }

    const subCategory = await prisma.subCategory.findUnique({ where: { id } });
    if (!subCategory) {
      return res.status(404).json({ status: 404, success: false, message: "SubCategory not found" });
    }

    return res.status(200).json({ status: 200, success: true, message: "SubCategory fetched successfully", data: subCategory });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getMyProfile(req, res) {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.user.id },
      include: {
        Permission: {
          include: { feature: true },
        },
      },
    });

    if (!admin) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Admin not found",
      });
    }

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Profile fetched successfully",
      admin: admin,
      data: admin,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function editProfile(req, res) {
  try {
    const { full_name, phone_no } = req.body;

    const updated = await prisma.admin.update({
      where: { id: req.user.id },
      data: {
        ...(full_name !== undefined && { full_name }),
        ...(phone_no !== undefined && { phone_no }),
      },
      include: {
        Permission: {
          include: { feature: true },
        },
      },
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Profile updated successfully",
      admin: updated,
      data: updated,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getUserSubscription(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 10);

    const [data, total] = await Promise.all([
      prisma.userSubscription.findMany({
        include: { user: true, plan: true },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.userSubscription.count(),
    ]);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "User subscriptions fetched successfully",
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getSingleSubscription(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid subscription id" });
    }

    const data = await prisma.userSubscription.findUnique({
      where: { id },
      include: { user: true, plan: true },
    });

    if (!data) {
      return res.status(404).json({ status: 404, success: false, message: "Subscription not found" });
    }

    return res.status(200).json({ status: 200, success: true, message: "Subscription fetched successfully", data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getPromotedAssets(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;

    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 10);

    const where = {
      promote: {
        gt: 0,
      },
    };

    const [data, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: {
          AssetImages: true,
          category: true,
          subCategory: true,
          user: true,
        },
        orderBy: [
          { promote: "desc" },
          { createdAt: "desc" },
        ],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.asset.count({ where }),
    ]);

    if (!data || data.length === 0) {
      return res.status(200).json({
        status: 200,
        success: true,
        message: "No promoted assets found",
        data: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          totalPages: 0,
        },
      });
    }

    data.forEach((asset) => {
      if (asset.AssetImages?.length) {
        asset.AssetImages = asset.AssetImages.map((img) => ({
          ...img,
          image_url: img.image_url
            ? `${baseurl}/images/${img.image_url}`
            : null,
        }));
      }

      if (asset.user?.avatar_url) {
        asset.user.avatar_url = `${baseurl}/images/${asset.user.avatar_url}`;
      }

      if (asset.category?.categoryImage) {
        asset.category.categoryImage = `${baseurl}/images/${asset.category.categoryImage}`;
      }

      if (asset.subCategory?.categoryImage) {
        asset.subCategory.categoryImage = `${baseurl}/images/${asset.subCategory.categoryImage}`;
      }
    });

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Promoted assets fetched successfully",
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error("getPromotedAssets Error:", error);

    return res.status(200).json({
      status: 200,
      success: false,
      message:
        "Unable to fetch promoted assets. Some assets have invalid subcategory references.",
      data: [],
      pagination: {
        page: Number.parseInt(req.query.page, 10) || 1,
        limit: Number.parseInt(req.query.limit, 10) || 10,
        total: 0,
        totalPages: 0,
      },
    });
  }
}

export async function getAssetStatus(req, res) {
  try {
    const status = await prisma.assetStatus.findMany({ orderBy: { id: "desc" } });
    return res.status(200).json({ status: 200, success: true, message: "Asset Status", status });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function addAssetStatus(req, res) {
  try {
    const schema = Joi.object({
      name: Joi.string().trim().min(1).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const created = await prisma.assetStatus.create({ data: { name: value.name } });
    return res.status(201).json({ status: 201, success: true, message: "Asset status created", data: created });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getAssetStatusById(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid id" });
    }

    const data = await prisma.assetStatus.findUnique({ where: { id } });
    if (!data) {
      return res.status(404).json({ status: 404, success: false, message: "Asset status not found" });
    }

    return res.status(200).json({ status: 200, success: true, message: "Asset status fetched", data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function editAssetStatusById(req, res) {
  try {
    const schema = Joi.object({
      id: Joi.number().required(),
      name: Joi.string().trim().min(1).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const updated = await prisma.assetStatus.update({
      where: { id: Number(value.id) },
      data: { name: value.name },
    });

    return res.status(200).json({ status: 200, success: true, message: "Asset status updated", data: updated });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function deleteAssetStatusById(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid id" });
    }

    await prisma.assetStatus.delete({ where: { id } });
    return res.status(200).json({ status: 200, success: true, message: "Asset status deleted" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function forgotPassword(req, res) {
  try {
    const schema = Joi.object({ email: Joi.string().email({ tlds: { allow: false } }).required() });
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const admin = await prisma.admin.findUnique({ where: { email: value.email.toLowerCase() } });
    if (!admin) {
      return res.status(404).json({ status: 404, success: false, message: "Admin not found" });
    }

    const token = randomStringAsBase64Url(32);
    await prisma.admin.update({ where: { id: admin.id }, data: { token } });

    const baseUrl = process.env.BASE_URL || "https://securpoint.app:4000";
    const resetLink = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"SecurPoint" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: "Password Reset Request - SecurPoint Admin",
      template: "mail_template",
      context: {
        title: "Admin Password Reset Request",
        message: "You recently requested to reset your password for your SecurPoint Admin account. Click the button below to reset your password. If you did not make this request, you can safely ignore this email.",
        href_url: resetLink,
        buttonText: "Reset Password",
        companyName: "SecurPoint",
        supportEmail: "SecurPointswe@gmail.com",
        logo: process.env.LOGO_URL || `${process.env.BASE_URL}/mainLogo.png`
      }
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      status: 200,
      success: true,
      message: "Password reset link has been sent to your email.",
      token,
    });
  } catch (error) {
    console.log("Error in admin forgotPassword:", error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function verifyPassword(req, res) {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ status: 400, success: false, message: "Token required" });
    }

    const admin = await prisma.admin.findFirst({ where: { token } });
    if (!admin) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid token" });
    }

    if (req.headers.accept && req.headers.accept.includes("text/html")) {
      return res.render("forgetPassword.ejs", { token, baseUrl: process.env.BASE_URL || "https://securpoint.app:4000" });
    }

    return res.status(200).json({ status: 200, success: true, message: "Token verified" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function changePassword(req, res) {
  try {
    const schema = Joi.object({
      token: Joi.string().required(),
      password: Joi.string().min(8).max(64).required(),
      confirm_password: Joi.string().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const admin = await prisma.admin.findFirst({ where: { token: value.token } });
    if (!admin) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid token" });
    }

    const hashedPassword = await bcrypt.hash(value.password, 10);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { password: hashedPassword, plainPassword: value.password, token: null },
    });

    if (req.headers.accept && req.headers.accept.includes("text/html")) {
      return res.sendFile(path.resolve(__dirname, "../view/message.html"));
    }

    return res.status(200).json({ status: 200, success: true, message: "Password updated successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getFAQs(req, res) {
  try {
    const data = await prisma.fAQ.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    return res.status(200).json({ status: 200, success: true, message: "FAQs fetched successfully", data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function addFAQ(req, res) {
  try {
    const schema = Joi.object({
      question: Joi.string().trim().min(1).required(),
      answer: Joi.string().trim().min(1).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const created = await prisma.fAQ.create({ data: value });
    return res.status(201).json({ status: 201, success: true, message: "FAQ created", data: created });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getFAQById(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid id" });
    }

    const data = await prisma.fAQ.findUnique({ where: { id } });
    if (!data) {
      return res.status(404).json({ status: 404, success: false, message: "FAQ not found" });
    }

    return res.status(200).json({ status: 200, success: true, message: "FAQ fetched", data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function editFAQById(req, res) {
  try {
    const schema = Joi.object({
      id: Joi.number().required(),
      question: Joi.string().trim().min(1).optional(),
      answer: Joi.string().trim().min(1).optional(),
    }).or("question", "answer");

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ status: 400, success: false, message: error.details[0].message });
    }

    const updated = await prisma.fAQ.update({
      where: { id: Number(value.id) },
      data: {
        ...(value.question !== undefined && { question: value.question }),
        ...(value.answer !== undefined && { answer: value.answer }),
      },
    });

    return res.status(200).json({ status: 200, success: true, message: "FAQ updated", data: updated });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function deleteFAQById(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid id" });
    }

    await prisma.fAQ.delete({ where: { id } });
    return res.status(200).json({ status: 200, success: true, message: "FAQ deleted" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function getPlans(req, res) {
  try {
    const plans = await prisma.plan.findMany({
      where: {
        id: { not: 1 }
      },
      orderBy: { id: "desc" },
    });

    return res.status(200).json({ status: 200, success: true, message: "Get All Plans", plans });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function toggleUserStatusByAdmin(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid user id" });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ status: 404, success: false, message: "User not found" });
    }

    const nextStatus = user.status === 1 ? 0 : 1;
    await prisma.user.update({ where: { id }, data: { status: nextStatus } });

    return res.status(200).json({ status: 200, success: true, message: nextStatus === 0 ? "User blocked" : "User unblocked" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}

export async function toggleAssetsStatusByAdmin(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ status: 400, success: false, message: "Invalid asset id" });
    }

    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      return res.status(404).json({ status: 404, success: false, message: "Asset not found" });
    }

    const nextBlockStatus = asset.blockStatus === 1 ? 0 : 1;
    await prisma.asset.update({ where: { id }, data: { blockStatus: nextBlockStatus } });

    return res.status(200).json({ status: 200, success: true, message: nextBlockStatus === 0 ? "Asset blocked" : "Asset unblocked" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, success: false, message: "Internal Server Error", error });
  }
}
