import Ember from 'ember';

export default Ember.Controller.extend({
    data: function() {
        return this.get('model');
    }.property('model'),

    randomIntInRange: function(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randomNode: function() {
      const nodes = this.get('model.nodes');
      return nodes[this.randomIntInRange(0, nodes.length)];
    },

    actions: {
        clickOption1: function(node) {
            console.log('you\'ve clicked option1 for node:', node);
        },

        clickOption2: function(node) {
            console.log('you\'ve clicked option2 for node:', node);
        },

        clickOption3: function(node) {
            console.log('you\'ve clicked option3 for node:', node);
        },

        clickOption4: function(node) {
            console.log('you\'ve clicked option4 for node:', node);
        },

        mutateData: function() {
          const { nodes, links } = this.get('model');

          const newNode = { id: this.randomIntInRange(0, 10000) };
          const newLink = { source: newNode.id, target: this.randomNode().id };
          console.log(newNode, newLink);
          this.setProperties({
            'model.nodes': nodes.concat([newNode]),
            'model.links': links.concat([newLink])
          });
        }
    }
});
