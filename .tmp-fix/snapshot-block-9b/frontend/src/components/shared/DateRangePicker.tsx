import { Input } from './Input';

interface DateRangePickerProps {
  startDate: Date | string;
  endDate: Date | string;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const formatDateInput = (date: Date | string) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ flex: '1', minWidth: '200px' }}>
        <Input
          type="date"
          label="Check-in"
          value={formatDateInput(startDate)}
          onChange={(e) => onStartDateChange(new Date(e.target.value))}
        />
      </div>
      <div style={{ flex: '1', minWidth: '200px' }}>
        <Input
          type="date"
          label="Check-out"
          value={formatDateInput(endDate)}
          onChange={(e) => onEndDateChange(new Date(e.target.value))}
        />
      </div>
    </div>
  );
}
