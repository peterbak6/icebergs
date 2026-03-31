import os
import csv
from collections import defaultdict

def scan_csv_fields(folder_path):
    field_counts = defaultdict(int)
    field_files = defaultdict(list)
    total_files = 0

    for filename in os.listdir(folder_path):
        if not filename.lower().endswith(".csv"):
            continue

        filepath = os.path.join(folder_path, filename)

        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                header = next(reader, None)

                if not header:
                    continue

                total_files += 1
                fields_in_file = set([h.strip() for h in header if h.strip()])

                for field in fields_in_file:
                    field_counts[field] += 1
                    field_files[field].append(filename)

        except Exception as e:
            print(f"⚠️ Failed to read {filename}: {e}")

    return field_counts, field_files, total_files


def print_summary(field_counts, field_files, total_files):
    print(f"\n📊 Total CSV files scanned: {total_files}\n")
    print(f"{'Field':30} | {'#Files':>6}")
    print("-" * 42)

    for field, count in sorted(field_counts.items(), key=lambda x: (-x[1], x[0])):
        print(f"{field:30} | {count:6}")

    print("\n🔍 Detailed (field → files):\n")
    for field, files in field_files.items():
        print(f"{field}:")
        for f in files:
            print(f"  - {f}")
        print()


if __name__ == "__main__":
    folder = "./data"  # 👈 change this to your folder

    field_counts, field_files, total_files = scan_csv_fields(folder)
    print_summary(field_counts, field_files, total_files)