import { config } from "dotenv";
config();
import path from "path";
import express, { Request, Response } from "express";
import { PDFAnalyser } from "./pdf-analyser";

// const app = express();
// const PORT = 3000;

// app.use(express.json());

// app.get("/", (req: Request, res: Response) => {
//     res.send("Hello, TypeScript with Express!");
// });

// app.listen(PORT, () => {
//     console.log(`Server running at http://localhost:${PORT}`);
// });

const pdfAnalyser = new PDFAnalyser(
    path.join(__dirname, "../pdfs/3929_21062025090532.pdf")
);
pdfAnalyser
    .analyse()
    .then((result) => {
        console.log("Analysis Result:", result);
    })
    .catch((error) => {
        console.error("Error during PDF analysis:", error);
    });
