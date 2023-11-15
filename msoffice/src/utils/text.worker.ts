import { clipToErrorContext } from './index';

export async function extractContext(paragraph: string, errorText: string, errorOffset: number): Promise<string> {
    return clipToErrorContext(paragraph, errorText, errorOffset);
}
