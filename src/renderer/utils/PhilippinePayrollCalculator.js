// Philippine Payroll Calculator Utility (Bi-Monthly)
// Based on 2025 Philippine Tax Brackets (TRAIN Law Phase 2)
// This model uses annualized income estimation for dynamic monthly tax calculation.

class PhilippinePayrollCalculator {
  // TRAIN Law 2025 Yearly Tax Brackets
  static calculateYearlyIncomeTax2025(annualTaxableIncome) {
    if (annualTaxableIncome <= 250000) {
      return 0;
    } else if (annualTaxableIncome <= 400000) {
      return (annualTaxableIncome - 250000) * 0.15;
    } else if (annualTaxableIncome <= 800000) {
      return 22500 + (annualTaxableIncome - 400000) * 0.20;
    } else if (annualTaxableIncome <= 2000000) {
      return 102500 + (annualTaxableIncome - 800000) * 0.25;
    } else if (annualTaxableIncome <= 8000000) {
      return 402500 + (annualTaxableIncome - 2000000) * 0.30;
    } else {
      return 2202500 + (annualTaxableIncome - 8000000) * 0.35;
    }
  }

  // Calculate Monthly Income Tax by annualizing current monthly income
  static calculateMonthlyIncomeTax(monthlySalary) {
    // Estimated Annual Income based on this month's earnings
    const annualSalary = monthlySalary * 12;
    const annualTax = this.calculateYearlyIncomeTax2025(annualSalary);
    // Return monthly tax portion
    return annualTax / 12;
  }

  // Calculate income tax for half-month (bi-monthly)
  static calculateBiMonthlyIncomeTax(halfMonthSalary) {
    // Annualize based on 24 pay periods
    const annualSalary = halfMonthSalary * 24;
    const annualTax = this.calculateYearlyIncomeTax2025(annualSalary);
    // Return bi-monthly tax portion
    return annualTax / 24;
  }

  // SSS Contributions 2024 (Bi-monthly calculation)
  static calculateSSS(grossSalary, isHalfMonth = true) {
    // If it's half month, double it for monthly calculation
    const monthlySalary = isHalfMonth ? grossSalary * 2 : grossSalary;

    // SSS contribution is based on compensation bracket
    const compensation = Math.min(Math.max(monthlySalary, 3000), 29750);

    // Find the bracket (simplified version)
    let employeeShare = 0;
    let employerShare = 0;

    if (compensation <= 3249.99) {
      employeeShare = 135;
      employerShare = 270;
    } else if (compensation <= 3749.99) {
      employeeShare = 157.50;
      employerShare = 315;
    } else if (compensation <= 4249.99) {
      employeeShare = 180;
      employerShare = 360;
    } else if (compensation <= 4749.99) {
      employeeShare = 202.50;
      employerShare = 405;
    } else if (compensation <= 5249.99) {
      employeeShare = 225;
      employerShare = 450;
    } else if (compensation <= 5749.99) {
      employeeShare = 247.50;
      employerShare = 495;
    } else if (compensation <= 6249.99) {
      employeeShare = 270;
      employerShare = 540;
    } else if (compensation <= 6749.99) {
      employeeShare = 292.50;
      employerShare = 585;
    } else if (compensation <= 7249.99) {
      employeeShare = 315;
      employerShare = 630;
    } else if (compensation <= 7749.99) {
      employeeShare = 337.50;
      employerShare = 675;
    } else if (compensation <= 8249.99) {
      employeeShare = 360;
      employerShare = 720;
    } else if (compensation <= 8749.99) {
      employeeShare = 382.50;
      employerShare = 765;
    } else if (compensation <= 9249.99) {
      employeeShare = 405;
      employerShare = 810;
    } else if (compensation <= 9749.99) {
      employeeShare = 427.50;
      employerShare = 855;
    } else if (compensation <= 10249.99) {
      employeeShare = 450;
      employerShare = 900;
    } else if (compensation <= 10749.99) {
      employeeShare = 472.50;
      employerShare = 945;
    } else if (compensation <= 11249.99) {
      employeeShare = 495;
      employerShare = 990;
    } else if (compensation <= 11749.99) {
      employeeShare = 517.50;
      employerShare = 1035;
    } else if (compensation <= 12249.99) {
      employeeShare = 540;
      employerShare = 1080;
    } else if (compensation <= 12749.99) {
      employeeShare = 562.50;
      employerShare = 1125;
    } else if (compensation <= 13249.99) {
      employeeShare = 585;
      employerShare = 1170;
    } else if (compensation <= 13749.99) {
      employeeShare = 607.50;
      employerShare = 1215;
    } else if (compensation <= 14249.99) {
      employeeShare = 630;
      employerShare = 1260;
    } else if (compensation <= 14749.99) {
      employeeShare = 652.50;
      employerShare = 1305;
    } else if (compensation <= 15249.99) {
      employeeShare = 675;
      employerShare = 1350;
    } else if (compensation <= 15749.99) {
      employeeShare = 697.50;
      employerShare = 1395;
    } else if (compensation <= 16249.99) {
      employeeShare = 720;
      employerShare = 1440;
    } else if (compensation <= 16749.99) {
      employeeShare = 742.50;
      employerShare = 1485;
    } else if (compensation <= 17249.99) {
      employeeShare = 765;
      employerShare = 1530;
    } else if (compensation <= 17749.99) {
      employeeShare = 787.50;
      employerShare = 1575;
    } else if (compensation <= 18249.99) {
      employeeShare = 810;
      employerShare = 1620;
    } else if (compensation <= 18749.99) {
      employeeShare = 832.50;
      employerShare = 1665;
    } else if (compensation <= 19249.99) {
      employeeShare = 855;
      employerShare = 1710;
    } else if (compensation <= 19749.99) {
      employeeShare = 877.50;
      employerShare = 1755;
    } else if (compensation <= 20249.99) {
      employeeShare = 900;
      employerShare = 1800;
    } else if (compensation <= 20749.99) {
      employeeShare = 922.50;
      employerShare = 1845;
    } else if (compensation <= 21249.99) {
      employeeShare = 945;
      employerShare = 1890;
    } else if (compensation <= 21749.99) {
      employeeShare = 967.50;
      employerShare = 1935;
    } else if (compensation <= 22249.99) {
      employeeShare = 990;
      employerShare = 1980;
    } else if (compensation <= 22749.99) {
      employeeShare = 1012.50;
      employerShare = 2025;
    } else if (compensation <= 23249.99) {
      employeeShare = 1035;
      employerShare = 2070;
    } else if (compensation <= 23749.99) {
      employeeShare = 1057.50;
      employerShare = 2115;
    } else if (compensation <= 24249.99) {
      employeeShare = 1080;
      employerShare = 2160;
    } else if (compensation <= 24749.99) {
      employeeShare = 1102.50;
      employerShare = 2205;
    } else if (compensation <= 25249.99) {
      employeeShare = 1125;
      employerShare = 2250;
    } else if (compensation <= 25749.99) {
      employeeShare = 1147.50;
      employerShare = 2295;
    } else if (compensation <= 26249.99) {
      employeeShare = 1170;
      employerShare = 2340;
    } else if (compensation <= 26749.99) {
      employeeShare = 1192.50;
      employerShare = 2385;
    } else if (compensation <= 27249.99) {
      employeeShare = 1215;
      employerShare = 2430;
    } else if (compensation <= 27749.99) {
      employeeShare = 1237.50;
      employerShare = 2475;
    } else if (compensation <= 28249.99) {
      employeeShare = 1260;
      employerShare = 2520;
    } else if (compensation <= 28749.99) {
      employeeShare = 1282.50;
      employerShare = 2565;
    } else if (compensation <= 29249.99) {
      employeeShare = 1305;
      employerShare = 2610;
    } else if (compensation <= 29750) {
      employeeShare = 1327.50;
      employerShare = 2655;
    }

    // Divide by 2 for bi-monthly if needed
    if (isHalfMonth) {
      employeeShare = employeeShare / 2;
      employerShare = employerShare / 2;
    }

    return {
      employeeShare: employeeShare,
      employerShare: employerShare,
      ec: 10 / (isHalfMonth ? 2 : 1) // EC contribution
    };
  }

  // PhilHealth Contributions 2024 (Bi-monthly)
  static calculatePhilHealth(grossSalary, isHalfMonth = true) {
    // PhilHealth premium is 4% of gross monthly salary
    // For employed members with compensation of ₱10,000.00 or below, the premium shall be at ₱450.00
    // Minimum: ₱450, Maximum: ₱5,000 (employee share max is ₱2,500)

    const monthlySalary = isHalfMonth ? grossSalary * 2 : grossSalary;

    let premium = monthlySalary * 0.04; // 4% of gross monthly salary

    // Minimum premium
    if (monthlySalary <= 10000) {
      premium = 450;
    }

    // Maximum premium
    premium = Math.min(premium, 5000);

    // Split equally between employer and employee
    let employeeShare = premium / 2;
    let employerShare = premium / 2;

    // Divide by 2 for bi-monthly if needed
    if (isHalfMonth) {
      employeeShare = employeeShare / 2;
      employerShare = employerShare / 2;
    }

    return {
      employeeShare: employeeShare,
      employerShare: employerShare,
      total: premium / (isHalfMonth ? 2 : 1)
    };
  }

  // Pag-IBIG Contributions (Bi-monthly)
  static calculatePagIbig(grossSalary, isHalfMonth = true) {
    // Pag-IBIG contribution is 2% of gross salary, but with caps
    const monthlySalary = isHalfMonth ? grossSalary * 2 : grossSalary;

    let employeeShare, employerShare;

    if (monthlySalary <= 1500) {
      employeeShare = monthlySalary * 0.01;
      employerShare = monthlySalary * 0.02;
    } else {
      // Maximum compensation for computation: ₱5,000
      const compensation = Math.min(monthlySalary, 5000);
      employeeShare = compensation * 0.02;
      employerShare = compensation * 0.02;
    }

    // Divide by 2 for bi-monthly if needed
    if (isHalfMonth) {
      employeeShare = employeeShare / 2;
      employerShare = employerShare / 2;
    }

    return {
      employeeShare: employeeShare,
      employerShare: employerShare,
      total: (employeeShare + employerShare) / (isHalfMonth ? 2 : 1)
    };
  }

  // Calculate 13th Month Pay (1/12 of basic salary)
  static calculateThirteenthMonth(basicSalary, monthsWorked = 12) {
    return (basicSalary * monthsWorked) / 12;
  }

  // Calculate payroll for half-month (10th and 25th cutoff)
  static calculateHalfMonthPayroll(basicSalary, allowances = 0, otherDeductions = 0, workingDays = 12, daysPresent = 12, isFirstHalf = true) {
    // Half month salary calculation (24 working days per month / 2 = 12 days per half)
    const dailyRate = basicSalary / 24; // 24 working days per month
    const halfMonthSalary = dailyRate * 12; // Base for 12 working days

    // Adjust for actual days present
    const actualSalary = (daysPresent / workingDays) * halfMonthSalary;

    // Calculate mandatory deductions based on monthly salary
    const monthlySalary = basicSalary;
    const mandatoryDeductions = this.calculateMandatoryDeductions(monthlySalary, true); // true for bi-monthly

    // Calculate income tax (Set to 0 for bi-monthly as requested, deferred to full month)
    const incomeTax = 0;

    const totalDeductions = mandatoryDeductions.total + incomeTax + otherDeductions;
    const netSalary = actualSalary + allowances - totalDeductions;

    // Calculate employer contributions for half-month
    const employerContributions = {
      sss: mandatoryDeductions.sss.employerShare,
      philhealth: mandatoryDeductions.philhealth.employerShare,
      pagibig: mandatoryDeductions.pagibig.employerShare,
      total: mandatoryDeductions.sss.employerShare + mandatoryDeductions.philhealth.employerShare + mandatoryDeductions.pagibig.employerShare
    };

    return {
      cutoffType: isFirstHalf ? 'First Half (1st-10th)' : 'Second Half (11th-25th)',
      workingDays: workingDays,
      daysPresent: daysPresent,
      dailyRate: dailyRate,
      basicSalary: actualSalary,
      allowances: allowances,
      grossSalary: actualSalary + allowances,
      deductions: {
        mandatory: {
          sss: {
            employee: mandatoryDeductions.sss.employeeShare,
            employer: mandatoryDeductions.sss.employerShare,
            total: mandatoryDeductions.sss.employeeShare + mandatoryDeductions.sss.employerShare
          },
          philhealth: {
            employee: mandatoryDeductions.philhealth.employeeShare,
            employer: mandatoryDeductions.philhealth.employerShare,
            total: mandatoryDeductions.philhealth.total
          },
          pagibig: {
            employee: mandatoryDeductions.pagibig.employeeShare,
            employer: mandatoryDeductions.pagibig.employerShare,
            total: mandatoryDeductions.pagibig.total
          },
          total: mandatoryDeductions.total
        },
        incomeTax: incomeTax,
        otherDeductions: otherDeductions,
        total: totalDeductions
      },
      employerContributions: employerContributions,
      netSalary: netSalary
    };
  }

  // Calculate mandatory deductions (bi-monthly)
  static calculateMandatoryDeductions(grossSalary, isHalfMonth = false) {
    const sss = this.calculateSSS(grossSalary, isHalfMonth);
    const philhealth = this.calculatePhilHealth(grossSalary, isHalfMonth);
    const pagibig = this.calculatePagIbig(grossSalary, isHalfMonth);

    const totalDeductions = sss.employeeShare + philhealth.employeeShare + pagibig.employeeShare;

    return {
      sss: sss,
      philhealth: philhealth,
      pagibig: pagibig,
      total: totalDeductions
    };
  }

  // Calculate complete monthly payroll (combining two halves)
  static calculateMonthlyPayroll(basicSalary, firstHalfData, secondHalfData, allowances = 0, otherDeductions = 0) {
    const monthlyBasic = basicSalary;
    const monthlyAllowances = allowances * 2; // Assuming allowances per half month
    const monthlyGross = monthlyBasic + monthlyAllowances;

    // Combine deductions from both halves
    const mandatoryDeductions = {
      sss: {
        employee: (firstHalfData.deductions.mandatory.sss.employee + secondHalfData.deductions.mandatory.sss.employee) * 2,
        employer: (firstHalfData.deductions.mandatory.sss.employer + secondHalfData.deductions.mandatory.sss.employer) * 2,
        total: (firstHalfData.deductions.mandatory.sss.employee + secondHalfData.deductions.mandatory.sss.employer +
          secondHalfData.deductions.mandatory.sss.employee + secondHalfData.deductions.mandatory.sss.employer)
      },
      philhealth: {
        employee: (firstHalfData.deductions.mandatory.philhealth.employee + secondHalfData.deductions.mandatory.philhealth.employee) * 2,
        employer: (firstHalfData.deductions.mandatory.philhealth.employer + secondHalfData.deductions.mandatory.philhealth.employer) * 2,
        total: (firstHalfData.deductions.mandatory.philhealth.total + secondHalfData.deductions.mandatory.philhealth.total) * 2
      },
      pagibig: {
        employee: (firstHalfData.deductions.mandatory.pagibig.employee + secondHalfData.deductions.mandatory.pagibig.employee) * 2,
        employer: (firstHalfData.deductions.mandatory.pagibig.employer + secondHalfData.deductions.mandatory.pagibig.employer) * 2,
        total: (firstHalfData.deductions.mandatory.pagibig.total + secondHalfData.deductions.mandatory.pagibig.total) * 2
      }
    };

    const monthlyMandatoryTotal = mandatoryDeductions.sss.employee + mandatoryDeductions.philhealth.employee + mandatoryDeductions.pagibig.employee;
    const monthlyIncomeTax = this.calculateMonthlyIncomeTax(monthlyGross);
    const monthlyOtherDeductions = otherDeductions * 2;
    const monthlyTotalDeductions = monthlyMandatoryTotal + monthlyIncomeTax + monthlyOtherDeductions;

    const monthlyNetSalary = monthlyGross - monthlyTotalDeductions;
    const thirteenthMonth = this.calculateThirteenthMonth(basicSalary);

    return {
      basicSalary: monthlyBasic,
      allowances: monthlyAllowances,
      grossSalary: monthlyGross,
      deductions: {
        mandatory: mandatoryDeductions,
        incomeTax: monthlyIncomeTax,
        otherDeductions: monthlyOtherDeductions,
        total: monthlyTotalDeductions
      },
      netSalary: monthlyNetSalary,
      thirteenthMonth: thirteenthMonth,
      firstHalf: firstHalfData,
      secondHalf: secondHalfData
    };
  }
}

export default PhilippinePayrollCalculator;