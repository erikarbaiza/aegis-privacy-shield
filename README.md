# AEGIS Privacy Shield

Extensión de navegador que evita que tus datos personales y tus claves lleguen a ChatGPT, Claude, Gemini o Copilot.

Antes de que un mensaje salga de tu navegador, AEGIS cambia los datos sensibles por etiquetas (`[EMAIL_ADDRESS_1]`, `[DNI_1]`...). La IA solo ve las etiquetas. Cuando responde, AEGIS repone tus datos reales en tu pantalla, así que sigues recibiendo la respuesta completa.

```
Tú escribes:      Mi DNI es 12345678Z y mi email erik@correo.com
La IA recibe:     Mi DNI es [DNI_1] y mi email [EMAIL_ADDRESS_1]
Tú ves:           (la respuesta con tus datos reales ya repuestos)
```

La detección se hace en tu navegador. No hace falta ningún servidor.

## Demo

Abre `demo.html` con doble clic. Es una página única, sin conexión ni dependencias, donde puedes pegar un texto y ver qué detectaría la extensión.

## Qué detecta

19 patrones, con validación algorítmica para evitar falsos positivos.

- **Datos personales (6):** email, IBAN (mod-97), tarjeta bancaria (Luhn), teléfono, DNI/NIE (letra de control), IPv4 pública.
- **Secretos (13):** claves de OpenAI, Anthropic, AWS, Google, Stripe y GitHub, tokens JWT, Bearer y Slack, claves privadas, contraseñas en código, cadenas de conexión MongoDB, client secrets de OAuth.
- Avisa también si pegas nombres de archivos sensibles (`.env`, `id_rsa`, `credentials.json`...).

## Sitios protegidos

chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, Gmail y Outlook Web.

## Instalar (Chrome o Edge)

1. Abre `chrome://extensions` (en Edge, `edge://extensions`).
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta de este repositorio.
4. Recarga la pestaña de la IA que vayas a usar.

## Modos

- **Seguro:** solo protege credenciales y claves.
- **Equilibrado:** protege también datos personales (por defecto).
- **Estricto:** pide confirmación antes de enviar un mensaje con datos sensibles.
- **Silencioso:** protege igual, pero sin avisos visuales.

También puedes marcar sitios de confianza en los que AEGIS no actúa, ver un historial de lo que ha protegido y exportarlo (CSV o evidencia GDPR).

## Límites conocidos

- Depende de cómo está construida cada web. Si una IA cambia el diseño de su cuadro de texto, la extensión puede dejar de enganchar hasta que se actualicen los selectores en `content.js`. Ya pasó con ChatGPT.
- La detección local no reconoce nombres propios ni direcciones. Para eso existe un modo opcional con servidor, que no se incluye en este repositorio.
- Está pensada como proyecto personal y no está publicada en la Chrome Web Store.

## Pruebas

Abre `test-runner.html` en el navegador para ejecutar los casos de prueba de los detectores.
