import pdfDist from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "fs";
import { Transaction } from "./types/pdf-analyser.types";

export class PDFAnalyser {
    constructor(public filePath: string) {}

    parseLineByLine(items: { str: string; x: number; y: number }[]) {
        const epsilon = 2;
        const linesMap: {
            [y: number]: { y: number; items: typeof items };
        } = {};

        for (const item of items) {
            const key = Object.keys(linesMap).find(
                (k) => Math.abs(Number(k) - item.y) < epsilon
            );
            if (key) {
                linesMap[key].items.push(item);
            } else {
                linesMap[item.y] = { y: item.y, items: [item] };
            }
        }

        const lines = Object.values(linesMap)
            .sort((a, b) => b.y - a.y) // Top to bottom
            .map((line) =>
                line.items
                    .sort((a, b) => a.x - b.x)
                    .map((i) => i.str)
                    .filter((str) => str !== " ")
            );

        return lines;
    }

    private isDateString(input: string): boolean {
        const parsedDate = new Date(input);
        return !isNaN(parsedDate.getTime());
    }

    private parseTable(tableRows: string[][]): Transaction[] {
        const transactions: Transaction[] = [];

        let currentLine = 0,
            totalLines = tableRows.length;
        while (currentLine < totalLines) {
            let [dateStr, details, debitStr, creditStr, balanceStr] =
                tableRows[currentLine];

            currentLine++;
            while (
                currentLine < totalLines &&
                !this.isDateString(tableRows[currentLine][0])
            ) {
                details += tableRows[currentLine][0];
                currentLine++;
            }

            transactions.push({
                date: this.isDateString(dateStr) ? dateStr : "",
                details,
                debit: Number(debitStr) || 0,
                credit: Number(creditStr) || 0,
                balance: Number(balanceStr) || 0,
            });
        }

        return transactions;
    }

    async analyse() {
        const pdfBuffer = readFileSync(this.filePath);
        const uint8Array = new Uint8Array(pdfBuffer);

        const loadingTask = pdfDist.getDocument({
            data: uint8Array,
            password: process.env.PDF_PASSWORD,
        });
        const pdfDocument = await loadingTask.promise;

        const numPages = pdfDocument.numPages;
        const allTransactions = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();

            const items = content.items.map((item: any) => ({
                str: item.str,
                x: item.transform[4], // X coordinate
                y: item.transform[5], // Y coordinate
            }));

            const pageLines = this.parseLineByLine(items);
            const headerRegex =
                /Date\s*Details\s*Ref No\.\/Cheque\s*Debit\s*Credit\s*Balance/;

            for (const line of pageLines) {
                if (headerRegex.test(line.join(" "))) {
                    let tableRows = pageLines.slice(
                        pageLines.indexOf(line) + 2 // skip header and next line(because it is 'No' fo 'Cheque')
                    );
                    const lastLineOfPageContent =
                        tableRows[tableRows.length - 1][0];

                    if (
                        lastLineOfPageContent ===
                        "** This is computer generated statement and does not require a signature."
                    ) {
                        tableRows = tableRows.slice(0, -3);
                    }

                    const transactions = this.parseTable(tableRows);
                    allTransactions.push(...transactions);
                }
            }
        }

        return allTransactions;
    }
}
