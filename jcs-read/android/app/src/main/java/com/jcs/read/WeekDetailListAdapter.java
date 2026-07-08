package com.jcs.read;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public final class WeekDetailListAdapter extends BaseAdapter {
    private static final int TYPE_HEADER = 0;
    private static final int TYPE_DOCUMENT = 1;

    private final LayoutInflater inflater;
    private final Context context;
    private final List<Row> rows = new ArrayList<Row>();
    private String weekLabel = "";
    private String bibleReading = "";

    public WeekDetailListAdapter(Context context) {
        this.context = context;
        inflater = LayoutInflater.from(context);
    }

    public void setDocuments(
        List<JcsStorage.DocumentEntry> documents,
        String weekLabel,
        String bibleReading
    ) {
        this.weekLabel = weekLabel != null ? weekLabel : "";
        this.bibleReading = bibleReading != null ? bibleReading : "";
        rows.clear();

        if (documents == null || documents.isEmpty()) {
            notifyDataSetChanged();
            return;
        }

        List<JcsStorage.DocumentEntry> sorted = new ArrayList<JcsStorage.DocumentEntry>(documents);
        Collections.sort(
            sorted,
            new Comparator<JcsStorage.DocumentEntry>() {
                @Override
                public int compare(JcsStorage.DocumentEntry a, JcsStorage.DocumentEntry b) {
                    String kindA = DocumentUi.resolveKind(a);
                    String kindB = DocumentUi.resolveKind(b);
                    String sectionA = DocumentUi.sectionKeyForKind(kindA);
                    String sectionB = DocumentUi.sectionKeyForKind(kindB);
                    int order = DocumentUi.sectionOrder(sectionA) - DocumentUi.sectionOrder(sectionB);
                    if (order != 0) return order;
                    order = DocumentUi.documentOrder(kindA) - DocumentUi.documentOrder(kindB);
                    if (order != 0) return order;
                    String titleA = a.title != null ? a.title : "";
                    String titleB = b.title != null ? b.title : "";
                    return titleA.compareToIgnoreCase(titleB);
                }
            });

        String lastSection = null;
        for (JcsStorage.DocumentEntry doc : sorted) {
            String kind = DocumentUi.resolveKind(doc);
            String sectionKey = DocumentUi.sectionKeyForKind(kind);

            if (!sectionKey.equals(lastSection)) {
                Row header = new Row();
                header.type = TYPE_HEADER;
                header.sectionTitle = DocumentUi.sectionTitleForKey(context, sectionKey);
                rows.add(header);
                lastSection = sectionKey;
            }

            Row item = new Row();
            item.type = TYPE_DOCUMENT;
            item.document = doc;
            rows.add(item);
        }

        notifyDataSetChanged();
    }

    public JcsStorage.DocumentEntry getDocumentAt(int position) {
        Row row = rows.get(position);
        if (row.type == TYPE_DOCUMENT) {
            return row.document;
        }
        return null;
    }

    @Override
    public int getCount() {
        return rows.size();
    }

    @Override
    public Object getItem(int position) {
        return rows.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public int getViewTypeCount() {
        return 2;
    }

    @Override
    public int getItemViewType(int position) {
        return rows.get(position).type;
    }

    @Override
    public boolean isEnabled(int position) {
        return rows.get(position).type == TYPE_DOCUMENT;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        Row row = rows.get(position);
        if (row.type == TYPE_HEADER) {
            View header = convertView;
            if (header == null) {
                header = inflater.inflate(R.layout.item_section_header, parent, false);
            }
            TextView sectionTitle = (TextView) header.findViewById(R.id.sectionTitle);
            sectionTitle.setText(row.sectionTitle);
            return header;
        }

        View item = convertView;
        if (item == null) {
            item = inflater.inflate(R.layout.item_document_card, parent, false);
        }

        JcsStorage.DocumentEntry doc = row.document;
        String kind = DocumentUi.resolveKind(doc);

        TextView docTitle = (TextView) item.findViewById(R.id.docTitle);
        TextView docSubtitle = (TextView) item.findViewById(R.id.docSubtitle);
        View docThumb = item.findViewById(R.id.docThumb);

        docTitle.setText(DocumentUi.displayTitle(context, doc, weekLabel));
        String subtitle = DocumentUi.displaySubtitle(context, doc, weekLabel, bibleReading);
        if (subtitle != null && subtitle.length() > 0) {
            docSubtitle.setText(subtitle);
            docSubtitle.setVisibility(View.VISIBLE);
        } else {
            docSubtitle.setVisibility(View.GONE);
        }

        docThumb.setBackgroundResource(DocumentUi.thumbDrawableForKind(kind));

        ViewGroup.LayoutParams params = item.getLayoutParams();
        if (params == null) {
            params = new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        if (position < getCount() - 1 && getItemViewType(position + 1) == TYPE_DOCUMENT) {
            if (params instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
                marginParams.bottomMargin = dp(parent, 8);
                item.setLayoutParams(marginParams);
            }
        } else if (params instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
            marginParams.bottomMargin = 0;
            item.setLayoutParams(marginParams);
        }

        return item;
    }

    private static int dp(View view, int value) {
        float density = view.getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private static final class Row {
        int type;
        String sectionTitle;
        JcsStorage.DocumentEntry document;
    }
}
