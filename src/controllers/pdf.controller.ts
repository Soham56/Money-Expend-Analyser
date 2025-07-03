import { Request, Response, NextFunction } from "express";
import { PDFAnalyser } from "../pdf-analyser";

export const analysePDF = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { pdfPath } = req.body;
        if (!pdfPath) {
            res.status(400).json({ error: "PDF path is required" });
            return;
        }

        const pdfAnalyser = new PDFAnalyser(pdfPath);
        const result = await pdfAnalyser.analyse();
        res.json(result);
    } catch (error) {
        console.error("Error during PDF analysis:", error);
        res.status(500).json({
            error: "An error occurred during PDF analysis",
        });
        next(error);
    }
};
