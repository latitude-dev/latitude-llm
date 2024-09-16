export function objectToString(object: any) {
  try {
    return JSON.stringify(object)
  } catch (error) {
    return 'Error: Provider returned an object that could not be stringified'
  }
}
