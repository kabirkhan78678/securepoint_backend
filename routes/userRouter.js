import express from "express";
import { addAsset, createPassword, createContactUs, getLabels, deleteAccount, deleteAsset, deleteAssetImage, editAsset, editProfile, forgotPassword, getAllAssets, getAssetStatus, getCategories, getLastSeen, getMyActivePlans, getMyAssets, getMySavedAssets, getMySingleAsset, getPlans, getSingleAsset, getSubCategories, getUserById, homePage, publicAssetDetails, publicHomePage, login, myProfile, purchasePlan, reportAsset, reportProfile, resetPassword, saveOrUnSaveAsset, signupWithEmail, verifyForgetPasswordOtp, verifyOtpEmail, getFAQs, getMySettings, updateMySettings, getTermsAndConditions, privacyPolicy, getAllCategory, getAllSubCategory, emailPhoneUpdate, resendforgotPassword } from "../controllers/userController.js";
import { auth } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import { getcms } from "../controllers/adminController.js";

export const userRouter = express.Router();

userRouter.post('/signupByEmail', signupWithEmail);

userRouter.post('/verifyOtpMail', verifyOtpEmail);

userRouter.post('/createPassword', createPassword);

userRouter.post('/login', login);

userRouter.post('/forgetPassword', forgotPassword);

userRouter.post("/resendOTP", resendforgotPassword);

userRouter.post('/verifyForgetPasswordOtp', verifyForgetPasswordOtp);

userRouter.post('/resetPassword', resetPassword);

// Contact Us (no authentication)
userRouter.post('/contactUs', createContactUs);

userRouter.get('/myProfile', auth, myProfile);

userRouter.post('/editProfile', auth, upload.single('image'), editProfile);


userRouter.get('/getCategories', auth, getCategories)

userRouter.get('/getSubCategories/:id', getSubCategories);

userRouter.post('/addAsset', auth, upload.array('image'), addAsset);

userRouter.post('/editAsset', auth, upload.array('image'), editAsset);

userRouter.delete('/assetImage/:id', auth, deleteAssetImage);

userRouter.get('/getMySingleAsset/:id', auth, getMySingleAsset);

userRouter.get('/getMyAssets', auth, getMyAssets);

userRouter.get('/getAllAssets', getAllAssets);

userRouter.get('/homePage', auth, homePage);

userRouter.get('/publicHomePage', publicHomePage);

userRouter.get('/publicAsset/:id', publicAssetDetails);

userRouter.get('/asset/:id', auth, getSingleAsset);

userRouter.get('/getUser/:id', getUserById);

userRouter.post('/saveAsset/:id', auth, saveOrUnSaveAsset);

userRouter.get("/mySavedAssets", auth, getMySavedAssets);

userRouter.get('/allPlans', auth, getPlans);

userRouter.post('/addPlan/:planId', auth, purchasePlan);

userRouter.get('/myPlans', auth, getMyActivePlans);

userRouter.delete('/asset/:id', auth, deleteAsset);

userRouter.post('/reportUser', auth, reportProfile);

userRouter.post('/reportAsset', auth, reportAsset);

userRouter.get('/assetStatus', auth, getAssetStatus);

userRouter.delete('/deleteAccount', auth, deleteAccount);

userRouter.get("/getLastSeen/:userId", auth, getLastSeen);

userRouter.get("/faqs", getFAQs);

userRouter.get('/settings', auth, getMySettings);

userRouter.patch('/settings', auth, updateMySettings);

userRouter.get('/termsConditions', getTermsAndConditions);

userRouter.get('/privacyPolicy', privacyPolicy);

userRouter.post("/getCms", getcms);

userRouter.get('/getAllCategories', auth, getAllCategory)

userRouter.get('/getAllSubCategories', getAllSubCategory);

userRouter.post('/emailPhoneUpdate', auth, emailPhoneUpdate);

userRouter.get("/getLables", auth, getLabels);
