import { Router } from "express";
import { analysePDF } from "../controllers/pdf.controller";

const router = Router();

router.post("pdf/analyse", analysePDF);

export default router;
