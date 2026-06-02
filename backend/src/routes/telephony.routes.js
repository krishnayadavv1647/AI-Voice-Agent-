import express from "express";
import { handleIncomingTelephony } from "../controllers/telephonyConfig.controller.js";

const router = express.Router();

router.post("/:provider/incoming", handleIncomingTelephony);

export default router;
