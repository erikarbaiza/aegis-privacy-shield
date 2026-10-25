# Registro de cambios

## 1.6.0 (2026-10-25)

### Añadido
- Detección aproximada de direcciones postales: tipo de vía, nombre y número (`Calle Mayor 5, 3º B`), y código postal con prefijo (`CP 48001`).
- Icono propio y página de inicio del proyecto.
- El menú muestra el estado de AEGIS en la pestaña actual: si está activo y si encuentra el cuadro de texto.
- Política de privacidad y plantilla para informar de problemas.
- Registro de depuración opcional (`localStorage.aegisDebug = "1"`), que nunca escribe los valores detectados.

### Corregido
- **Claude:** la protección dependía de leer el cuadro de texto al pulsar Enter, pero Claude envía y vacía el cuadro antes. Ahora la sustitución se prepara mientras se escribe. También se reconoce la ruta nueva que usa Claude.
- **Gemini:** su formato real de petición (un objeto `Request` con el cuerpo en formato formulario, con espacios como `+`) dejaba pasar teléfonos y direcciones. Ahora se sustituyen también los datos con tildes escapadas y con codificación de formulario.
- El patrón de teléfono capturaba direcciones IP: una IP pública salía etiquetada como teléfono y una privada se enmascaraba sin motivo.
- Los secretos se procesan antes que los datos personales, para que una clave no se trocee como si fuera un teléfono o un email.
- La sustitución se mantiene hasta 2 minutos, porque un mismo mensaje puede viajar en varias peticiones seguidas.
- Los cuerpos binarios ya no se reescriben como texto.
- Permisos reducidos: ya no se pide `tabs` ni acceso a todos los sitios. El acceso a un servidor propio es opcional y se pide solo al configurarlo.
- Textos que prometían más de lo que hace: la "confianza" fija (100 % / 99 %) se sustituye por el método real de detección, y el informe ya no afirma que ningún dato se haya transmitido.
- El menú muestra la versión real de la extensión.

## 1.5.0

- Soporte para Gmail y Outlook Web.
- Modo silencioso, lista de sitios de confianza, número de datos protegidos sobre el icono y exportación del historial en CSV.

## 1.4.0 y anteriores

- Detección de datos personales y secretos con validación por algoritmo, modos de protección, vista de explicación y exportación del informe.
