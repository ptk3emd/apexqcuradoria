import React from 'react';
import {splitLinks} from '../lib/linkify';

// Free text with every http(s) address drawn as a link (new tab, no referrer).
export function LinkifiedText({text,className=''}:{text?:string|null;className?:string}) {
 const segments=splitLinks(text?.trim());
 if(!segments.length) return null;
 return <p className={`whitespace-pre-wrap break-words ${className}`}>
  {segments.map((seg,i)=>seg.type==='link'
   ?<a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-brand-muted underline underline-offset-2 hover:text-white">{seg.value}</a>
   :<React.Fragment key={i}>{seg.value}</React.Fragment>)}
 </p>;
}
