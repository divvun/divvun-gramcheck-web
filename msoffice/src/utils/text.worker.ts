import { clipToErrorContext } from './index';

export async function extractContext(paragraph: string, errorText: string): Promise<string> {
    return clipToErrorContext(paragraph, errorText);
}
