/**
 * Recurrence rule utilities for generating event occurrences.
 * 
 * Supports a simplified RRULE format:
 * - FREQ=WEEKLY;BYDAY=TH (every Thursday)
 * - FREQ=WEEKLY;INTERVAL=2;BYDAY=TH (every other Thursday)
 * - FREQ=MONTHLY;BYDAY=1TH (first Thursday of month)
 * - FREQ=MONTHLY;BYDAY=2TH (second Thursday of month)
 * - FREQ=MONTHLY;BYDAY=-1TH (last Thursday of month)
 */

export interface RecurrenceRule {
  freq: "WEEKLY" | "MONTHLY";
  interval: number; // 1 = every, 2 = every other, etc.
  byDay?: string; // MO, TU, WE, TH, FR, SA, SU (with optional position prefix for monthly)
  byDayPosition?: number; // 1, 2, 3, 4, -1 (last) for monthly rules
}

// Day mapping
const DAY_TO_JS_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/**
 * Parse an RRULE string into a RecurrenceRule object
 */
export function parseRecurrenceRule(rule: string): RecurrenceRule | null {
  if (!rule) return null;
  
  const parts = rule.split(";");
  const result: RecurrenceRule = {
    freq: "WEEKLY",
    interval: 1,
  };
  
  for (const part of parts) {
    const [key, value] = part.split("=");
    
    switch (key) {
      case "FREQ":
        if (value === "WEEKLY" || value === "MONTHLY") {
          result.freq = value;
        } else {
          return null; // Unsupported frequency
        }
        break;
      
      case "INTERVAL":
        result.interval = parseInt(value, 10) || 1;
        break;
      
      case "BYDAY":
        // Parse BYDAY which can be "TH" or "1TH" or "-1TH"
        const byDayMatch = value.match(/^(-?\d)?([A-Z]{2})$/);
        if (byDayMatch) {
          if (byDayMatch[1]) {
            result.byDayPosition = parseInt(byDayMatch[1], 10);
          }
          result.byDay = byDayMatch[2];
        } else {
          return null;
        }
        break;
    }
  }
  
  return result;
}

/**
 * Serialize a RecurrenceRule back to RRULE string
 */
export function serializeRecurrenceRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];
  
  if (rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }
  
  if (rule.byDay) {
    const position = rule.byDayPosition ? rule.byDayPosition.toString() : "";
    parts.push(`BYDAY=${position}${rule.byDay}`);
  }
  
  return parts.join(";");
}

/**
 * Generate occurrence dates for a recurring event
 */
export function generateOccurrences(
  rule: RecurrenceRule,
  startDate: Date,
  endDate: Date | null,
  maxOccurrences: number = 52 // Default to ~1 year of weekly events
): Date[] {
  const occurrences: Date[] = [];
  
  // Default end date is 3 months from now
  const effectiveEnd = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  
  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  if (rule.freq === "WEEKLY") {
    // For weekly, find the first occurrence on the target day
    const targetDay = rule.byDay ? DAY_TO_JS_INDEX[rule.byDay] : current.getDay();
    
    // Advance to the first occurrence
    while (current.getDay() !== targetDay) {
      current.setDate(current.getDate() + 1);
    }
    
    // Generate occurrences
    while (current <= effectiveEnd && occurrences.length < maxOccurrences) {
      occurrences.push(new Date(current));
      current.setDate(current.getDate() + 7 * rule.interval);
    }
  } else if (rule.freq === "MONTHLY") {
    // For monthly with BYDAY (e.g., "first Thursday")
    const targetDay = rule.byDay ? DAY_TO_JS_INDEX[rule.byDay] : current.getDay();
    const position = rule.byDayPosition || 1;
    
    // Start from the beginning of the start month
    current.setDate(1);
    
    while (current <= effectiveEnd && occurrences.length < maxOccurrences) {
      const occurrence = getNthWeekdayOfMonth(current, targetDay, position);
      
      if (occurrence && occurrence >= startDate && occurrence <= effectiveEnd) {
        occurrences.push(occurrence);
      }
      
      // Move to next month
      current.setMonth(current.getMonth() + rule.interval);
      current.setDate(1);
    }
  }
  
  return occurrences;
}

/**
 * Get the nth occurrence of a weekday in a given month
 * @param monthDate - Any date in the target month
 * @param weekday - Day of week (0 = Sunday, 6 = Saturday)
 * @param n - Which occurrence (1 = first, 2 = second, -1 = last)
 */
function getNthWeekdayOfMonth(monthDate: Date, weekday: number, n: number): Date | null {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  if (n > 0) {
    // Find nth occurrence from start of month
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = firstOfMonth.getDay();
    
    // Calculate the first occurrence of the target weekday
    let dayOfMonth = 1 + ((weekday - firstWeekday + 7) % 7);
    
    // Add weeks to get to the nth occurrence
    dayOfMonth += (n - 1) * 7;
    
    // Check if this date is still in the same month
    const result = new Date(year, month, dayOfMonth);
    if (result.getMonth() !== month) {
      return null; // The nth occurrence doesn't exist in this month
    }
    
    return result;
  } else {
    // Find nth occurrence from end of month (n = -1 means last)
    const lastOfMonth = new Date(year, month + 1, 0);
    const lastDay = lastOfMonth.getDate();
    const lastWeekday = lastOfMonth.getDay();
    
    // Calculate the last occurrence of the target weekday
    let dayOfMonth = lastDay - ((lastWeekday - weekday + 7) % 7);
    
    // Subtract weeks for -2, -3, etc.
    dayOfMonth += (n + 1) * 7;
    
    if (dayOfMonth < 1) {
      return null; // The nth-from-last occurrence doesn't exist
    }
    
    return new Date(year, month, dayOfMonth);
  }
}

/**
 * Human-readable description of a recurrence rule
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const dayName = rule.byDay ? getDayName(rule.byDay) : "day";
  
  if (rule.freq === "WEEKLY") {
    if (rule.interval === 1) {
      return `Every ${dayName}`;
    } else if (rule.interval === 2) {
      return `Every other ${dayName}`;
    } else {
      return `Every ${rule.interval} weeks on ${dayName}`;
    }
  } else if (rule.freq === "MONTHLY") {
    const positionText = getPositionText(rule.byDayPosition || 1);
    if (rule.interval === 1) {
      return `${positionText} ${dayName} of every month`;
    } else {
      return `${positionText} ${dayName} every ${rule.interval} months`;
    }
  }
  
  return "Custom recurrence";
}

function getDayName(dayCode: string): string {
  const names: Record<string, string> = {
    SU: "Sunday",
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
  };
  return names[dayCode] || dayCode;
}

function getPositionText(position: number): string {
  if (position === -1) return "Last";
  if (position === 1) return "First";
  if (position === 2) return "Second";
  if (position === 3) return "Third";
  if (position === 4) return "Fourth";
  return `${position}th`;
}

/**
 * Build a recurrence rule from form-friendly options
 */
export function buildRecurrenceRule(options: {
  frequency: "weekly" | "biweekly" | "monthly";
  dayOfWeek: string; // MO, TU, WE, TH, FR, SA, SU
  monthlyPosition?: number; // 1, 2, 3, 4, -1 (for monthly only)
}): string {
  if (options.frequency === "weekly") {
    return `FREQ=WEEKLY;BYDAY=${options.dayOfWeek}`;
  } else if (options.frequency === "biweekly") {
    return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${options.dayOfWeek}`;
  } else if (options.frequency === "monthly") {
    const position = options.monthlyPosition || 1;
    return `FREQ=MONTHLY;BYDAY=${position}${options.dayOfWeek}`;
  }
  
  return "";
}

/**
 * Extract form-friendly options from a recurrence rule
 */
export function extractRecurrenceOptions(rule: string): {
  frequency: "weekly" | "biweekly" | "monthly" | "none";
  dayOfWeek: string;
  monthlyPosition: number;
} {
  const parsed = parseRecurrenceRule(rule);
  
  if (!parsed) {
    return {
      frequency: "none",
      dayOfWeek: "TH",
      monthlyPosition: 1,
    };
  }
  
  let frequency: "weekly" | "biweekly" | "monthly" | "none" = "none";
  
  if (parsed.freq === "WEEKLY") {
    frequency = parsed.interval === 2 ? "biweekly" : "weekly";
  } else if (parsed.freq === "MONTHLY") {
    frequency = "monthly";
  }
  
  return {
    frequency,
    dayOfWeek: parsed.byDay || "TH",
    monthlyPosition: parsed.byDayPosition || 1,
  };
}
