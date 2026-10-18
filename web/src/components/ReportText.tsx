import { Fragment } from "react";

function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`")
    ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>)}</>;
}

/** A small text renderer. Agent text is always escaped; no HTML or scripts. */
export default function ReportText({ text }: { text: string }) {
  const lines = text.replace(/\\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) items.push(lines[i++].trim().slice(2));
      blocks.push(<ul key={i}>{items.map((item, n) => <li key={n}><Inline text={item} /></li>)}</ul>);
    } else if (/^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*$/.test(line)) {
      blocks.push(<h3 key={i}><Inline text={line.replace(/^#{1,6}\s+/, "")} /></h3>); i++;
    } else {
      const paragraph = [line]; i++;
      while (i < lines.length && lines[i].trim() && !/^([-*]\s|#{1,6}\s|\*\*[^*]+\*\*$)/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
      blocks.push(<p key={i}><Inline text={paragraph.join(" ")} /></p>);
    }
  }
  return <div className="report-prose">{blocks}</div>;
}
