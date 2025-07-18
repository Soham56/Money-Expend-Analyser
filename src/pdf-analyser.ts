import pdfDist from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "fs";
import { ExpenditureSummary, Transaction } from "./types/pdf-analyser.types";

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
        const allTransactions: Transaction[] = [];

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

        return this.summarizeExpenditure(allTransactions);
    }

    private summarizeExpenditure(transactions: Transaction[]) {
        let expenditureSummary: ExpenditureSummary = {
            totalDebitAmount: 0,
            totalCreditAmount: 0,
            startDate: new Date(),
            endDate: new Date(),
            totalMoneyExpended: 0,
            totalMoneyIncreased: 0,
        };

        const dateWiseGroupedTransactions: {
            [date: string]: Omit<Transaction, "date">[];
        } = {};
        const uniqueDates = new Set<string>();

        for (let index = 0; index < transactions.length; index++) {
            const { debit, credit, date, balance, details } =
                transactions[index];
            expenditureSummary.totalDebitAmount += debit;
            expenditureSummary.totalCreditAmount += credit;
            const dateKey = new Date(date).toISOString().split("T")[0];

            if (!dateWiseGroupedTransactions[dateKey]) {
                dateWiseGroupedTransactions[dateKey] = [];
            }

            dateWiseGroupedTransactions[dateKey].push({
                debit,
                credit,
                balance,
                details,
            });

            uniqueDates.add(dateKey);
        }

        const startDate = Array.from(uniqueDates).sort()[0];
        const endDate = Array.from(uniqueDates).sort().reverse()[0];

        const {
            debit: startingDebit,
            credit: startingCredit,
            balance: startingBalance,
        } = dateWiseGroupedTransactions[startDate][
            dateWiseGroupedTransactions[startDate].length - 1
        ];

        const startingAmount = startingDebit
            ? startingBalance + startingDebit
            : startingBalance - startingCredit;

        const endingAmount = dateWiseGroupedTransactions[endDate][0].balance;

        expenditureSummary.totalMoneyExpended = startingAmount - endingAmount;
        expenditureSummary.totalMoneyIncreased = endingAmount - startingAmount;
        expenditureSummary.startDate = new Date(startDate);
        expenditureSummary.endDate = new Date(endDate);

        return expenditureSummary;
    }

    private yearWiseExpenditure(transactions: Transaction[]): {
        [year: string]: ExpenditureSummary;
    } {
        const yearWiseTrasactions: { [year: number]: Transaction[] } = {};

        transactions.forEach((transaction) => {
            const year = new Date(transaction.date).getFullYear();
            if (!yearWiseTrasactions[year]) {
                yearWiseTrasactions[year] = [];
            }

            yearWiseTrasactions[year].push(transaction);
        });

        const yearWiseSummary: { [year: string]: ExpenditureSummary } = {};

        for (const year in yearWiseTrasactions) {
            yearWiseSummary[year] = this.summarizeExpenditure(
                yearWiseTrasactions[year]
            );
        }

        return yearWiseSummary;
    }

    private monthWiseExpenditure(transactions: Transaction[]): {
        [yearMonth: string]: ExpenditureSummary;
    } {
        const monthWiseTransactions: { [yearMonth: string]: Transaction[] } =
            {};

        transactions.forEach((transaction) => {
            const yearMonth =
                new Date(transaction.date).getMonth() +
                1 +
                "-" +
                new Date(transaction.date).getFullYear();
            if (!monthWiseTransactions[yearMonth]) {
                monthWiseTransactions[yearMonth] = [];
            }

            monthWiseTransactions[yearMonth].push(transaction);
        });

        const monthWiseSummary: { [yearMonth: string]: ExpenditureSummary } =
            {};

        for (const yearMonth in monthWiseTransactions) {
            monthWiseSummary[yearMonth] = this.summarizeExpenditure(
                monthWiseTransactions[yearMonth]
            );
        }

        return monthWiseSummary;
    }
}
