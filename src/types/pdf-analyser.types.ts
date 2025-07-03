export interface Transaction {
    date: string;
    details: string;
    debit: number;
    credit: number;
    balance: number;
}

export interface ExpenditureSummary {
    totalDebitAmount: number;
    totalCreditAmount: number;
    startDate: Date;
    endDate: Date;
    totalMoneyExpended: number;
    totalMoneyIncreased: number;
}
