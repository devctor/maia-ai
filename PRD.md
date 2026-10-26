Caso técnico: Full Stack Developer
Maia Care

1. Contexto
Maia Care está desarrollando una plataforma digital de salud que ayuda a las mujeres a entender y
gestionar mejor su salud mediante experiencias digitales personalizadas.
Con este ejercicio queremos conocer cómo piensas y cómo tomas decisiones técnicas:
arquitectura, backend, frontend, modelado de datos, integración con IA y testing. La funcionalidad
es deliberadamente sencilla: no evaluamos creatividad de producto, sino cómo diseñas una
solución pequeña pero preparada para evolucionar.
2. Objetivo
Construye una pequeña aplicación web en la que una usuaria pueda registrar periódicamente cómo
se encuentra y recibir un insight personalizado, generado con IA a partir de sus registros anteriores.
Flujo principal: Registro → Persistencia → Análisis → Insight → Visualización
Como mínimo, la aplicación debe permitir:
• Crear un registro.
• Consultar los registros anteriores.
• Generar un insight a partir de los últimos registros.
• Visualizar el insight generado.
3. Registros
Cada registro puede incluir, por ejemplo: fecha, bienestar general, calidad del sueño, nivel de
energía, nivel de estrés, síntomas y notas libres.
Estos campos son orientativos. Puedes modificar o simplificar el modelo si crees que existe una
opción mejor.
4. Insight con IA
El insight puede incluir, por ejemplo:
• Un breve resumen de la evolución reciente.
• Patrones o cambios relevantes.
• Temas que podría ser útil comentar con un profesional sanitario.
Importante: la IA no debe realizar diagnósticos médicos ni presentar sus resultados como tales.
Proveedor de IA
Puedes usar el proveedor que prefieras. No necesitas una cuenta de pago: sirve cualquier nivel
gratuito, respetando sus límites de uso. Si no tienes acceso a ninguna API, puedes implementar un
Maia Care · Caso técnico Full Stack · 2
servicio simulado (mock), manteniendo separadas la lógica de negocio y la integración con el
proveedor.
Respuesta estructurada
Preferimos que la respuesta de la IA tenga una estructura definida en lugar de texto libre. Este
formato es solo un ejemplo; puedes definir el que consideres más adecuado:
{
"summary": "...",
"patterns": ["...", "..."],
"topics_to_discuss": ["...", "..."]
}
Ten en cuenta que la respuesta de un sistema externo puede llegar incompleta o en un formato
inválido.
5. Requisitos técnicos
Backend
Puedes elegir la estructura de API que consideres adecuada. Como mínimo, esperamos:
• API para crear y consultar registros.
• Endpoint o mecanismo para generar un insight.
• Validación de los datos de entrada y manejo razonable de errores.
• Persistencia de los datos.
• Separación entre lógica de negocio, acceso a datos e integración con IA.
No es necesario implementar autenticación real.
Base de datos
Puedes usar la tecnología que prefieras y justificar brevemente la elección. El modelo debería
incluir, como mínimo, usuarias, registros e insights, así como la relación entre un insight y los
registros que se usaron para generarlo.
Frontend
Una interfaz sencilla que permita crear un registro, ver los anteriores, solicitar un nuevo insight y
visualizarlo. No evaluamos diseño visual: basta con que sea clara y funcional.
Testing
Incluye tests de las partes que consideres más importantes y explica en el README por qué las
has elegido (no buscamos una cobertura total).
Tecnologías
Utiliza las tecnologías que te resulten más cómodas, con una arquitectura razonablemente cercana
a un entorno de producción.
6. Funcionalidades opcionales
No son necesarias para completar el ejercicio. Si implementas alguna, explica brevemente qué
valor aporta:
• Autenticación.
• Gráficos de evolución de los registros.
• Reintentos ante errores del proveedor de IA.
Maia Care · Caso técnico Full Stack · 3
• Generación asíncrona o streaming de los insights.
• Docker, CI/CD o despliegue en la nube.
Recuerda: una solución pequeña, bien diseñada y documentada es preferible a una más amplia
pero incompleta.
7. Entrega
Comparte el proyecto mediante un repositorio Git que incluya el código fuente, los tests y un
README con:
• Cómo ejecutar el proyecto, incluida la configuración necesaria.
• La arquitectura general y las principales decisiones técnicas.
• Cómo funciona la integración con IA: qué datos se envían al modelo y cómo validas su
respuesta.
• Consideraciones básicas de privacidad y seguridad.
• Qué mejorarías si tuvieras más tiempo.
8. Qué valoraremos
• La calidad de las decisiones técnicas y de la arquitectura.
• El modelado de datos y la calidad de la API.
• La integración con IA y el tratamiento de sus respuestas.
• El testing y las consideraciones de seguridad y privacidad.
• La claridad de la documentación y la capacidad para explicar ventajas e inconvenientes.
9. Siguiente paso: conversación
Tras la entrega, revisaremos con nuestro equipo de tecnología para darte feedback. De ser
positivo, te invitaremos a comentaremos juntos tu solución y cómo la harías evolucionar en un
producto real.
