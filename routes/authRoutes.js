import express from "express";
import { adminLogin, staffLogin } from "../controllers/authController.js";

const router = express.Router();

router.post("/admin-login", adminLogin);
router.post("/staff-login", staffLogin);

export default router;