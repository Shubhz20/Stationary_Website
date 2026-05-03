const AppError = require('../common/AppError');

/**
 * Joi validation middleware factory.
 *
 * Usage:
 *   const { createProductSchema } = require('./product.validator');
 *   router.post('/', validate(createProductSchema), controller.create);
 *
 * The schema should be a Joi object with keys for 'body', 'params', 'query'.
 * Example schema:
 *   Joi.object({
 *     body: Joi.object({ name: Joi.string().required() }),
 *     params: Joi.object({ id: Joi.string().hex().length(24) }),
 *   });
 *
 * Or just validate body directly:
 *   validate(Joi.object({ name: Joi.string().required() }), 'body')
 */
const validate = (schema, source = null) => {
  return (req, res, next) => {
    if (source) {
      // Validate a single source (body, params, query)
      const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const details = error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, ''),
        }));
        return next(AppError.badRequest('Validation failed', details));
      }

      req[source] = value;
      return next();
    }

    // Validate multiple sources from a compound schema
    const sources = ['body', 'params', 'query'];
    const allDetails = [];

    for (const src of sources) {
      if (schema.describe && schema.describe().keys && schema.describe().keys[src]) {
        // Extract the sub-schema for this source
        const subSchema = schema.extract(src);
        const { error, value } = subSchema.validate(req[src], {
          abortEarly: false,
          stripUnknown: true,
        });

        if (error) {
          error.details.forEach((d) => {
            allDetails.push({
              field: `${src}.${d.path.join('.')}`,
              message: d.message.replace(/"/g, ''),
            });
          });
        } else {
          req[src] = value;
        }
      }
    }

    if (allDetails.length > 0) {
      return next(AppError.badRequest('Validation failed', allDetails));
    }

    next();
  };
};

module.exports = validate;
