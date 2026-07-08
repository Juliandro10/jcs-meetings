package com.jcs.read;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

public final class WeekListAdapter extends BaseAdapter {
    private final LayoutInflater inflater;
    private final List<JcsStorage.WeekEntry> weeks = new ArrayList<JcsStorage.WeekEntry>();

    public WeekListAdapter(Context context) {
        inflater = LayoutInflater.from(context);
    }

    public void setWeeks(List<JcsStorage.WeekEntry> items) {
        weeks.clear();
        if (items != null) {
            weeks.addAll(items);
        }
        notifyDataSetChanged();
    }

    @Override
    public int getCount() {
        return weeks.size();
    }

    @Override
    public JcsStorage.WeekEntry getItem(int position) {
        return weeks.get(position);
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View row = convertView;
        if (row == null) {
            row = inflater.inflate(R.layout.item_week_card, parent, false);
        }

        JcsStorage.WeekEntry entry = getItem(position);
        TextView weekLabel = (TextView) row.findViewById(R.id.weekLabel);
        TextView weekReading = (TextView) row.findViewById(R.id.weekReading);
        View weekThumb = row.findViewById(R.id.weekThumb);

        weekLabel.setText(entry.label != null ? entry.label : "");
        if (entry.bibleReading != null && entry.bibleReading.length() > 0) {
            weekReading.setText(entry.bibleReading);
            weekReading.setVisibility(View.VISIBLE);
        } else {
            weekReading.setVisibility(View.GONE);
        }

        weekThumb.setBackgroundResource(DocumentUi.thumbDrawableForKind("mwb"));

        ViewGroup.LayoutParams params = row.getLayoutParams();
        if (params == null) {
            params = new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        if (position < getCount() - 1) {
            if (params instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
                marginParams.bottomMargin = dp(parent, 10);
                row.setLayoutParams(marginParams);
            }
        } else if (params instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
            marginParams.bottomMargin = 0;
            row.setLayoutParams(marginParams);
        }

        return row;
    }

    private static int dp(View view, int value) {
        float density = view.getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
