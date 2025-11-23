/**
 * Booking utilities for confirmation page
 */

/**
 * Generate a booking reference number (format: CF-YYYYMMDD-XXXX)
 * Example: CF-20231122-A3F7
 */
export function generateBookingReference(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Generate random 4-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const code = Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    return `CF-${year}${month}${day}-${code}`;
}

/**
 * Create an .ics calendar file for the booking
 */
export function generateCalendarFile(
    pickupDateTime: Date,
    pickupLocation: string,
    dropoffLocation: string,
    bookingRef: string
): string {
    const formatDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    // Estimate 1 hour duration
    const endTime = new Date(pickupDateTime.getTime() + 60 * 60 * 1000);

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Chesterfield Taxi//Booking//EN',
        'BEGIN:VEVENT',
        `UID:${bookingRef}@chesterfieldtaxi.com`,
        `DTSTAMP:${formatDate(new Date())}`,
        `DTSTART:${formatDate(pickupDateTime)}`,
        `DTEND:${formatDate(endTime)}`,
        `SUMMARY:Taxi Pickup - ${bookingRef}`,
        `DESCRIPTION:Chesterfield Taxi Ride\\nFrom: ${pickupLocation}\\nTo: ${dropoffLocation}\\nBooking Ref: ${bookingRef}`,
        `LOCATION:${pickupLocation}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    return icsContent;
}

/**
 * Download a file with the given content
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Format booking data for printing
 */
export function formatBookingForPrint(): void {
    window.print();
}
