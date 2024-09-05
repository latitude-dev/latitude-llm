class DateFormatUtils {
  private locale: Intl.LocalesArgument
  private formatter: Intl.DateTimeFormat

  constructor({ locale = 'en-US' }: { locale?: Intl.LocalesArgument }) {
    this.locale = locale
    this.formatter = new Intl.DateTimeFormat(this.locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  formatDate(date: Date) {
    return this.formatter.format(date)
  }
}

// For now we fallback to en-US locale
export const dateFormatter = new DateFormatUtils({ locale: 'en-US' })
