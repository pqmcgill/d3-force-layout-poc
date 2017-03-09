(function() {
  function vendorModule() {
    'use strict';

    return { 'default': self['d3'] };
  }

  define('d3', [], vendorModule);
})();
