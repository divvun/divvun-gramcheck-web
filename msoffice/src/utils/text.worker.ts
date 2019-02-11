import { highlightError } from './index';

export async function extractContext(paragraph: string, errorText: string): Promise<string> {
    return highlightError(paragraph, errorText);
}
