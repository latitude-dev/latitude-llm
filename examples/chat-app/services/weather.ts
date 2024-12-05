import axios from 'axios'

interface WeatherResponse {
  temperature: number
  description: string
  location: string
}

export async function getWeather(location: string): Promise<WeatherResponse> {
  try {
    // Using OpenWeatherMap API - you'll need to sign up for a free API key
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        location,
      )}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENWEATHER_API_KEY}`,
        },
      },
    )

    return {
      temperature: response.data.main.temp,
      description: response.data.weather[0].description,
      location: response.data.name,
    }
  } catch (error) {
    console.log(error)
    throw new Error(`Failed to get weather for ${location}`)
  }
}
