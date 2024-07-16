import EnvVars from '$src/common/EnvVars'

import server from './server'

const SERVER_START_MSG = 'Express server started on port: ' + EnvVars.PORT

server.listen(EnvVars.PORT, () => {
  console.info(SERVER_START_MSG)
})
