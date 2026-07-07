package com.jcs.tnme;

public final class BibleHtml {
    private BibleHtml() {}

    public static String wrapChapter(
        String bookTitle,
        int bookNumber,
        int chapterNumber,
        String bodyHtml,
        String publicationCss,
        int verseStart,
        int verseEnd) {
        int safeEnd = verseEnd >= verseStart ? verseEnd : verseStart;

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>");
        sb.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>");
        sb.append("<style>");
        sb.append("body{margin:0;padding:16px;font-family:sans-serif;font-size:17px;line-height:1.55;color:#e5e7eb;background:#111827;}");
        sb.append(".tnme-head{margin-bottom:12px;color:#c4b5fd;font-weight:700;font-size:13px;text-transform:uppercase;}");
        sb.append(".jwpub-content{color:#e5e7eb;}");
        sb.append(".jwpub-content img{max-width:100%;height:auto;}");
        sb.append(".jwpub-content a{color:#a78bfa;}");
        sb.append(".prose-bible .vl,.prose-bible .cl,.jwpub-content .vl,.jwpub-content .cl{color:#c4b5fd;font-weight:600;}");
        sb.append(".tnme-highlight{background:rgba(167,139,250,0.18);outline:2px solid rgba(167,139,250,0.45);border-radius:4px;}");
        if (publicationCss != null && publicationCss.length() > 0) {
            sb.append(publicationCss);
        }
        sb.append("</style></head><body>");
        sb.append("<div class=\"tnme-head\">").append(escape(bookTitle)).append(" ").append(chapterNumber).append("</div>");
        sb.append("<div class=\"jwpub-content prose-bible\">").append(bodyHtml).append("</div>");
        sb.append("<script>");
        sb.append("(function(){");
        sb.append("var book=").append(bookNumber).append(",chapter=").append(chapterNumber).append(";");
        sb.append("var start=").append(verseStart).append(",end=").append(safeEnd).append(";");
        sb.append("function findVerse(n){");
        sb.append("var el=document.getElementById('verse'+n);");
        sb.append("if(el)return el;");
        sb.append("el=document.querySelector('span[id^=\"v'+book+'-'+chapter+'-'+n+'-\"]');");
        sb.append("if(el)return el;");
        sb.append("var prefix='v'+book+'-'+chapter+'-'+n+'-';");
        sb.append("var nodes=document.querySelectorAll('span[id]');");
        sb.append("for(var i=0;i<nodes.length;i++){var id=nodes[i].id||'';if(id.indexOf(prefix)===0)return nodes[i];}");
        sb.append("var labels=document.querySelectorAll('span.v,span.vl,span.cl');");
        sb.append("for(var j=0;j<labels.length;j++){");
        sb.append("var t=(labels[j].textContent||'').trim();");
        sb.append("var m=t.match(/^(\\d+)/);");
        sb.append("if(m&&parseInt(m[1],10)===n)return labels[j];}");
        sb.append("return null;}");
        sb.append("function highlightBlock(el){");
        sb.append("if(!el)return null;");
        sb.append("var node=el,id=node.id||'';");
        sb.append("if(id.indexOf('v'+book+'-'+chapter+'-')===0)return node;");
        sb.append("for(var d=0;d<5&&node;d++){");
        sb.append("var tag=(node.tagName||'').toUpperCase();");
        sb.append("var pid=node.id||'';");
        sb.append("if(pid.indexOf('v'+book+'-'+chapter+'-')===0)return node;");
        sb.append("if(tag==='P'||tag==='DIV'||tag==='LI')return node;");
        sb.append("node=node.parentElement;}");
        sb.append("return el;}");
        sb.append("function mark(el){");
        sb.append("if(!el)return;");
        sb.append("var cls=el.className||'';");
        sb.append("if(cls.indexOf('tnme-highlight')<0){el.className=cls+' tnme-highlight';}}");
        sb.append("function scrollToEl(el){");
        sb.append("if(!el)return;");
        sb.append("var rect=el.getBoundingClientRect();");
        sb.append("var y=(window.pageYOffset||document.documentElement.scrollTop||0)+rect.top;");
        sb.append("window.scrollTo(0,Math.max(0,y-24));}");
        sb.append("function run(){");
        sb.append("var first=null;");
        sb.append("for(var v=start;v<=end;v++){");
        sb.append("var raw=findVerse(v);");
        sb.append("if(!raw)continue;");
        sb.append("var block=highlightBlock(raw);");
        sb.append("mark(block);");
        sb.append("if(!first)first=block;}");
        sb.append("if(first){scrollToEl(first);}else if(start>1){window.scrollTo(0,0);}}");
        sb.append("run();");
        sb.append("setTimeout(run,0);");
        sb.append("setTimeout(run,120);");
        sb.append("})();");
        sb.append("</script></body></html>");
        return sb.toString();
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }
}
