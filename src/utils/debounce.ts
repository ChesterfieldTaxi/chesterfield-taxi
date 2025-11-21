// Utility function to debounce API calls and prevent excessive requests
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    waitMs: number
): (...args: Parameters<T>) => void {
    let timeout: number;

    return function executedFunction(...args: Parameters<T>) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), waitMs) as unknown as number;
    };
}
