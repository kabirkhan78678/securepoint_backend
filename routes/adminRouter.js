import express from "express";
import {login, passwordChange, getAllUsers, addCategory, addSubCategory, getAllCategory, getAllSubCategory, updateCategory, updateSubCategory, reorderCategories, dashBoard, getAllAssets, deleteCategory, deleteSubCategory, reportedAssets, reportedProfiles, deleteAsset, deleteAccount, getUserSubscription, getPromotedAssets, getUserById, getSingleAsset, getSingleCategory, getSingleSubCategory,getMyProfile, editProfile,getSingleSubscription,getAssetStatus,addAssetStatus,getAssetStatusById,editAssetStatusById,deleteAssetStatusById,forgotPassword,verifyPassword,changePassword,getFAQById, addFAQ, getFAQs, editFAQById, deleteFAQById,getPlans,
    toggleUserStatusByAdmin, toggleAssetsStatusByAdmin,
    reviewRequest,
    getReviewRequests,
    sendNotificationToUsersBulk,
    sendNotificationToUser,
    sendAdminFeedback,
    updatePlan,
    getcms,
    updatecms,
    getLabels,
    updateLabel,
    createAdmin,
    getAdmins,
    deleteAdmin,
    updateAdmin,
    getFeatures,
    privacyPolicy,
    getAllContactUs
} from "../controllers/adminController.js";
import { adminAuth } from "../middlewares/adminAuth.js";
import { upload } from "../middlewares/upload.js";

export const adminRouter = express.Router();

adminRouter.post("/createAdmin", adminAuth(["ADMIN"]), createAdmin);

adminRouter.get("/getAdmins", adminAuth(["SUBADMIN", "ADMIN"]), getAdmins);

adminRouter.delete("/deleteAdmin/:id", adminAuth(["ADMIN"]), deleteAdmin);

adminRouter.patch("/updateAdmin", adminAuth(["SUBADMIN", "ADMIN"]), updateAdmin);

adminRouter.post("/login", login);

adminRouter.get('/profile', adminAuth(["SUBADMIN", "ADMIN"]), getMyProfile);

adminRouter.patch('/profile', adminAuth(["SUBADMIN", "ADMIN"]), editProfile);

adminRouter.post("/changePassword", adminAuth(["ADMIN","SUBADMIN"]), passwordChange);

adminRouter.get('/dashBoard', adminAuth(["SUBADMIN", "ADMIN"]), dashBoard);

adminRouter.get("/allUsers", adminAuth(["SUBADMIN", "ADMIN"]), getAllUsers);

adminRouter.get("/allUsers/:userId", adminAuth(["SUBADMIN", "ADMIN"]), getUserById);

adminRouter.get("/allAssets", adminAuth(["SUBADMIN", "ADMIN"]), getAllAssets);

adminRouter.get("/allAssets/:id", adminAuth(["SUBADMIN", "ADMIN"]), getSingleAsset);

adminRouter.post("/addCategory", upload.single('image'), adminAuth(["SUBADMIN", "ADMIN"]), addCategory);

adminRouter.delete('/category/:categoryId', adminAuth(["SUBADMIN", "ADMIN"]), deleteCategory);

adminRouter.delete('/subCategory/:subcategoryId', adminAuth(["SUBADMIN", "ADMIN"]), deleteSubCategory);

adminRouter.post('/addSubCategory', adminAuth(["SUBADMIN", "ADMIN"]), addSubCategory);

adminRouter.get("/getAllCategory", adminAuth(["SUBADMIN", "ADMIN"]), getAllCategory);

adminRouter.put("/categories/reorder", adminAuth(["SUBADMIN", "ADMIN"]), reorderCategories);

adminRouter.post("/reorderCategories", adminAuth(["SUBADMIN", "ADMIN"]), reorderCategories);

adminRouter.get("/getAllSubCategory", adminAuth(["SUBADMIN", "ADMIN"]), getAllSubCategory);

adminRouter.get("/getAllCategory/:id", adminAuth(["SUBADMIN", "ADMIN"]), getSingleCategory);

adminRouter.get("/getAllSubCategory/:id", adminAuth(["SUBADMIN", "ADMIN"]), getSingleSubCategory);

adminRouter.post("/updateCategory", upload.single("image"), adminAuth(["SUBADMIN", "ADMIN"]), updateCategory); 

adminRouter.post("/updateSubCategory", adminAuth(["SUBADMIN", "ADMIN"]), updateSubCategory);

adminRouter.get("/reportedAssets", adminAuth(["SUBADMIN", "ADMIN"]), reportedAssets);

adminRouter.get("/reportedProfiles", adminAuth(["SUBADMIN", "ADMIN"]), reportedProfiles);

adminRouter.delete('/asset/:id', adminAuth(["SUBADMIN", "ADMIN"]), deleteAsset);

adminRouter.delete('/deleteUserAccount/:id',adminAuth(["SUBADMIN", "ADMIN"]), deleteAccount);

adminRouter.get("/userSubscription",adminAuth(["SUBADMIN", "ADMIN"]), getUserSubscription);

adminRouter.get("/userSubscription/:id",adminAuth(["SUBADMIN", "ADMIN"]), getSingleSubscription);

adminRouter.get("/promotedAssets",adminAuth(["SUBADMIN", "ADMIN"]), getPromotedAssets);

adminRouter.get('/assetStatus',adminAuth(["SUBADMIN", "ADMIN"]), getAssetStatus);

adminRouter.post('/assetStatus',adminAuth(["SUBADMIN", "ADMIN"]), addAssetStatus);

adminRouter.get('/assetStatus/:id',adminAuth(["SUBADMIN", "ADMIN"]), getAssetStatusById);

adminRouter.patch('/assetStatus',adminAuth(["SUBADMIN", "ADMIN"]), editAssetStatusById);

adminRouter.delete('/assetStatus/:id',adminAuth(["SUBADMIN", "ADMIN"]), deleteAssetStatusById);


adminRouter.post('/forgotPassword', forgotPassword );

adminRouter.get('/verifyPassword/:token', verifyPassword);

adminRouter.post('/resetPassword',changePassword );


adminRouter.get('/faq',adminAuth(["SUBADMIN", "ADMIN"]), getFAQs);

adminRouter.post('/faq',adminAuth(["SUBADMIN", "ADMIN"]), addFAQ);

adminRouter.get('/faq/:id',adminAuth(["SUBADMIN", "ADMIN"]), getFAQById);

adminRouter.patch('/faq',adminAuth(["SUBADMIN", "ADMIN"]), editFAQById);

adminRouter.delete('/faq/:id',adminAuth(["SUBADMIN", "ADMIN"]), deleteFAQById);

adminRouter.post('/blockUser/:id',adminAuth(["SUBADMIN", "ADMIN"]), toggleUserStatusByAdmin);

adminRouter.post('/blockAsset/:id',adminAuth(["SUBADMIN", "ADMIN"]), toggleAssetsStatusByAdmin);

adminRouter.get('/allPlans',adminAuth(["SUBADMIN", "ADMIN"]), getPlans);

// new changes 

adminRouter.post('/reviewRequest',adminAuth(["SUBADMIN", "ADMIN"]), reviewRequest);

adminRouter.get('/getReviewRequest',adminAuth(["SUBADMIN", "ADMIN"]), getReviewRequests);

adminRouter.post('/sendSingleNotification',adminAuth(["SUBADMIN", "ADMIN"]), sendNotificationToUser);

adminRouter.post('/sendBulkNotification',adminAuth(["SUBADMIN", "ADMIN"]), sendNotificationToUsersBulk);

adminRouter.put('/sendAdminFeedback',adminAuth(["SUBADMIN", "ADMIN"]), sendAdminFeedback);

adminRouter.post('/updatePlanPrice',adminAuth(["SUBADMIN", "ADMIN"]), updatePlan);

adminRouter.post("/getCms", getcms);

adminRouter.post('/updateCms',adminAuth(["SUBADMIN", "ADMIN"]), updatecms);

adminRouter.get("/getLables", adminAuth(["SUBADMIN", "ADMIN"]),  getLabels);

adminRouter.post('/updateLables',adminAuth(["SUBADMIN", "ADMIN"]), updateLabel);

adminRouter.get("/getFeatures", adminAuth(["SUBADMIN", "ADMIN"]),  getFeatures)

adminRouter.get('/privacyPolicy',privacyPolicy);

adminRouter.get("/contactUs", adminAuth(["SUBADMIN", "ADMIN"]), getAllContactUs);
