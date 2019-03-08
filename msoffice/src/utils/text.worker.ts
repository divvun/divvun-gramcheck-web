import { clipToErrorContext } from './index';
import * as BluebirdPromise from 'bluebird';

export async function extractContext(paragraph: string, errorText: string): BluebirdPromise<string> {
    return clipToErrorContext(paragraph, errorText);
}
