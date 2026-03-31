#!/usr/bin/env python3

import os
import csv
import json
from datetime import datetime

SENSOR_PRIORITY = [
    ("ascat", 1),
    ("qscat", 2),
    ("oscat", 3),
    ("ers", 4),
    ("nscat", 5),
    ("sass", 6),
    ("nic", 7),
]


def to_float(value):
    if value is None:
        return None
    s = str(value).strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(raw):
    """
    Returns ISO date string YYYY-MM-DD.

    Supported examples:
      2003021
      2003-021
      2003_021
      2003/01/21
      2003-01-21
      20030121
    """
    if raw is None:
        return None

    s = str(raw).strip()
    if not s:
        return None

    if len(s) == 7 and s.isdigit():
        year = int(s[:4])
        day_of_year = int(s[4:])
        dt = datetime.strptime(f"{year} {day_of_year}", "%Y %j")
        return dt.strftime("%Y-%m-%d")

    for sep in ("-", "_"):
        parts = s.split(sep)
        if len(parts) == 2 and len(parts[0]) == 4 and parts[0].isdigit() and parts[1].isdigit():
            year = int(parts[0])
            day_of_year = int(parts[1])
            dt = datetime.strptime(f"{year} {day_of_year}", "%Y %j")
            return dt.strftime("%Y-%m-%d")

    if len(s) == 8 and s.isdigit():
        dt = datetime.strptime(s, "%Y%m%d")
        return dt.strftime("%Y-%m-%d")

    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    raise ValueError(f"Unsupported date format: {raw}")


def choose_position(row):
    """
    Pick first available non-zero lat/lon pair by priority.
    Assumes:
      *_1 = lat
      *_2 = lon
    Returns:
      ([lat, lon], priority_index) or (None, None)
    """
    for sensor_key, priority_index in SENSOR_PRIORITY:
        lat = to_float(row.get(f"{sensor_key}_1"))
        lon = to_float(row.get(f"{sensor_key}_2"))
        if lat is not None and lon is not None and lat != 0.0 and lon != 0.0:
            return [lat, lon], priority_index

    return None, None


def choose_size(row):
    s1 = to_float(row.get("size_1"))
    s2 = to_float(row.get("size_2"))

    candidates = []
    if s1 is not None and s1 != 0.0:
        candidates.append(s1)
    if s2 is not None and s2 != 0.0:
        candidates.append(s2)

    return max(candidates) if candidates else None


def process_file(filepath):
    iceberg_id = os.path.splitext(os.path.basename(filepath))[0]
    records = []

    with open(filepath, "r", encoding="utf-8", errors="ignore", newline="") as f:
        reader = csv.DictReader(f)

        for row_num, row in enumerate(reader, start=1):
            raw_date = row.get("date")
            if raw_date is None or str(raw_date).strip() == "":
                continue

            try:
                date = parse_date(raw_date)
            except ValueError as e:
                print(f"[WARN] {filepath} row {row_num}: {e}")
                continue

            pos, source = choose_position(row)

            # skip rows without position
            if pos is None:
                continue

            size = choose_size(row)

            record = {
                "date": date,
                "pos": pos,
                "source": source,
                "size": size,
            }

            records.append(record)

    return iceberg_id, records


def process_folder(input_folder):
    grouped = {}

    filenames = sorted(
        fn for fn in os.listdir(input_folder)
        if fn.lower().endswith(".csv")
    )

    for filename in filenames:
        filepath = os.path.join(input_folder, filename)
        try:
            iceberg_id, records = process_file(filepath)
            grouped[iceberg_id] = records
            print(f"[OK] {filename}: {len(records)} rows")
        except Exception as e:
            print(f"[ERROR] {filename}: {e}")

    return grouped


if __name__ == "__main__":
    input_folder = "./data"
    output_json = "./icebergs_min.json"

    grouped_data = process_folder(input_folder)

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(grouped_data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWrote {len(grouped_data)} iceberg groups to: {output_json}")