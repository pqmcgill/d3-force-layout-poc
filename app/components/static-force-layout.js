import Ember from 'ember';

export default Ember.Component.extend({
    // properties of the component
    width: 1000,
    height: 1000,
    scale: 1,
    panX: 0,
    panY: 0,

    isLoading: true,
    isContextMenuActive: false,

    // link and node data passed in from parent
    data: null,

    // for convenience, used to map nodes by name for easy lookup
    _nodeMap: {},

    // mutable arrays required for d3 magic
    _links: [],
    _nodes: [],

    // initial setup
    didInsertElement: function() {
      this.updateGraphData();
      this.setupGraph();
      // move to bottom of call stack to allow other work to take priority
      // TODO: eventually will want to compute the initial force simulation in a webworker
      // on a separate thread so as not to hang the page
      setTimeout(() => {
          this.simulate();
          this.set('isLoading', false);
          this.redraw();
      }, 0);
    },

    // observes changes to either data nodes or data links
    onDataChanged: function() {
      this.set('isLoading', true);
      this.tearDownGraph();
      this.updateGraphData();
      // move to bottom of call stack to allow other work to take priority
      setTimeout(() => {
          this.simulate();
          this.set('isLoading', false);
          this.redraw();
      }, 0);
    }.observes('data.nodes', 'data.links'),

    // creates the view for the rendered visualization,
    // initializes the computational simulation
    setupGraph: function() {
      const self = this;

      this.zoom = d3.zoom()
        .scaleExtent([-100, 100])
        .on('zoom', function() {
            self.onZoom(self);
        });

       this.container = d3.select('svg#graph')
         .attr('width', this.get('width'))
         .attr('height', this.get('height'))
         .call(this.zoom)
         .on('mouseup', this.onContainerMouseUp.bind(this))
         .on('mousemove', function() {
             self.onContainerMouseMove(this);
         })
         .append('g');


      this.link = this.container.append('g').selectAll(".link");
      this.node = this.container.append('g').selectAll(".node");

      this.simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2));

    },

    // run the simulation against passed in data
    // TODO: eventually will want to compute the initial force simulation in a webworker
    // on a separate thread so as not to hang the page
    simulate: function() {
        // seed with data
        this.simulation.nodes(this._nodes)
        this.simulation.force('link')
            .links(this._links);

        // this equation returns the number of 'ticks' needed to get the graph into a stable state
        // it allows us to render a static graph deterministically
        const steps = Math.ceil(Math.log(this.simulation.alphaMin()) / Math.log(1 - this.simulation.alphaDecay()));
        for (var i = 0, n = steps; i < n; ++i) {
          this.simulation.tick();
        }
    },

    tearDownGraph: function() {
        this.container.selectAll('.link').remove();
        this.container.selectAll('.node').remove();
    },

    // mutates local state to match that of immutable parent state.
    // d3 mutates data, so we need to sync local link and node lists with
    // our application data so that d3 can perform it's mutations without touching
    // the original
    updateGraphData: function() {
      const latestNodes = this.get('data.nodes');
      const latestLinks = this.get('data.links');

      // used for tracking new nodes
      let retain = {};

      // add nodes that aren't found in old data
      latestNodes.forEach((n, i) => {
        retain[n.id] = true;

        if (!(n.id in this._nodeMap)) {
          const newNode = {
              id: n.id,
              r: 10
          };
          this._nodes.push(newNode);
          this._nodeMap[n.id] = newNode;
        }
      });

      // delete nodes that no longer are found in new data
      this._nodes.forEach((n, i) => {
        if (!(n.id in retain)) {
          delete this._nodeMap[n.id];
          this._nodes.splice(i, 1);
        }
      });

      // just return the links straight up
      // TODO: figure out if we do need to splice out old links
      let linksCopy = [];
      for (let i = 0; i < latestLinks.length; i++) {
        let link = latestLinks[i];
        const newLink = {
          source: this._nodeMap[link.source],
          target: this._nodeMap[link.target]
        };
        linksCopy.push(newLink);
      }

      this._links = linksCopy;
    },

    // rendering the graph based off of data and the simulation
    redraw: function() {
        // compute points representing bundled edges
        const forceBundledLinks = this.bundleLinks();

        // render edge layer first
        this.link = this.link.data(forceBundledLinks);
        this.link.exit().remove();
        this.link = this.link.enter().append('path')
            .attr('id', (d, i) => `link-${i}`)
            .attr('class', 'edge')
            .attr('fill', 'none')
            .attr('stroke', '#72CF1D')
            .attr('stroke-opacity', 0.3)
            .attr('stroke-width', 1 / this.scale)
            .attr('d', (d, i) => {
                return this.curve(forceBundledLinks[i]);
            })
            .on('mouseover', this.onLinkMouseOver.bind(this))
            .on('mouseout', this.onLinkMouseOut.bind(this))
            .merge(this.link);

        console.log(this.link);

        // render node layer second
        this.node = this.node.data(this._nodes);
        this.node.exit().remove();
        this.node = this.node.enter().append('circle')
            .attr('r', d => d.r)
            .attr('fill', () => {
                return '#ABABAB';
            })
            .attr('id', d => d.id)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 5 / this.scale)
            .on('mouseover', this.onNodeMouseOver.bind(this))
            .on('mouseout', this.onNodeMouseOut.bind(this))
            .on('mousedown', this.onNodeClick.bind(this))
            .on('mouseup', this.removeContextMenu.bind(this))
            .merge(this.node);
    },

    // events
    /////////////////////////////////////////////////////////
    onNodeMouseOver: function(d) {
        const linkedRelationships = this.findLinkedRelationships(d);
        this.highlightRelationships(linkedRelationships);
    },

    onNodeMouseOut: function() {
        this.resetStyledRelationships();
    },

    onNodeClick: function(d) {
        // render context menu centered at node's coordinates
        const pie = d3.pie()
            .value(1);

        const path = d3.arc()
            .outerRadius(30 / this.scale)
            .innerRadius(5 / this.scale);

        this.contextMenu = this.container
            .append('g')
                .attr('class', 'contextMenu')
                .attr('transform', `translate(${d.x}, ${d.y})`)
                .selectAll('.arc')
                    .data(pie([
                        { id: 'option1' },
                        { id: 'option2' },
                        { id: 'option3' },
                        { id: 'option4' }
                    ]))
                    .enter().append('g')
                        .attr('class', 'arc')
                        .on('mouseup', this.removeContextMenu.bind(this));

        this.contextMenu.append('path')
            .attr('class', 'contextMenuItem')
            .attr('id', d => {
                console.log(d);
                return d.data.id;
            })
            .attr('d', path)
            .attr('fill', '#000000')
            .attr('stroke', '#72CF1D')
            .attr('stroke-width', 1 / this.scale);

        // set state to nodeSelected
        this.setProperties({
            isContextMenuActive: true,
            activeContextNode: d
        });

        d3.event.stopPropagation();
    },

    onLinkMouseOver: function(d, i) {
        const link = this._links[i];
        this.highlightRelationships({
            nodes: [ link.source, link.target ],
            links: [ link ]
        });
    },

    onLinkMouseOut: function() {
        this.resetStyledRelationships();
    },

    onContainerMouseUp: function() {
        d3.event.stopPropagation();
        console.log('mouseup');

        if (this.get('isContextMenuActive')) {

            this.removeContextMenu();
        }
    },

    onContainerMouseMove: function(context) {
        if (this.get('isContextMenuActive')) {
            const mouseX = d3.mouse(context)[0];
            const mouseY = d3.mouse(context)[1];
            const offsetX = this.panX;
            const offsetY = this.panY;
            const nodeX = this.activeContextNode.x;
            const nodeY = this.activeContextNode.y;
            const x = (mouseX - offsetX) / this.scale;
            const y = (mouseY - offsetY) / this.scale;

            d3.selectAll('.contextMenuItem')
                .attr('fill', '#000000');

            if (x > nodeX && y < nodeY) {
                d3.select('#option1')
                    .attr('fill', '#72CF1D');
            } else if (x > nodeX && y > nodeY) {
                d3.select('#option2')
                    .attr('fill', '#72CF1D');
            } else if (x < nodeX && y > nodeY) {
                d3.select('#option3')
                    .attr('fill', '#72CF1D');
            } else if (x < nodeX && y < nodeY) {
                d3.select('#option4')
                    .attr('fill', '#72CF1D');
            }
        }
    },

    onZoom: function(context) {
        console.log('zooming');
        if (!context.get('isContextMenuActive')) {
            const { x, y, k } = d3.event.transform;
            context.scale = k;
            context.panX = x;
            context.panY = y;
            context.container.attr('transform', `translate(${x},${y}) scale(${k})`);
            context.link
                .attr('stroke-width', 1 / k);

            context.node
                .attr('r', 5 / k);
        }
    },

    // remove context menu from scene
    removeContextMenu: function() {
        this.setProperties({
            isContextMenuActive: false,
            activeContextNode: null
        });

        d3.selectAll('.contextMenu').remove();
    },

    // highlight the node that was clicked as well as those nodes that are
    // directly linked to it
    highlightRelationships: function(linkedRelationships) {
        const { links, nodes } = linkedRelationships
        console.log(linkedRelationships);
        d3.selectAll('circle')
            .attr('fill', '#D5D5D5');

        nodes.forEach(node => {
            d3.select(`#${node.id}`)
                .attr('fill', '#72CF1D');
        });

        links.forEach(link => {
            d3.select(`#link-${link.index}`)
                .attr('stroke', '#72CF1D')
                .attr('stroke-opacity', 1)
                .attr('stroke-width', 2 / this.scale);
        });
    },

    resetStyledRelationships: function() {
        d3.selectAll('circle')
            .attr('fill', '#ABABAB');

        d3.selectAll('.edge')
            .attr('stroke', '#72CF1D')
            .attr('stroke-opacity', 0.3)
            .attr('stroke-width', 1 / this.scale);
    },

    // return array of directly linked nodes given a particular node
    findLinkedRelationships: function(node) {
        return this._links.reduce((acc, link) => {
            if (link.source.id === node.id) {
                acc = {
                    links: [ ...acc.links, link ],
                    nodes: [ ...acc.nodes, link.target ]
                };
            }
            if (link.target.id === node.id) {
                acc = {
                    links: [ ...acc.links, link ],
                    nodes: [ ...acc.nodes, link.source ]
                };
            }
            return acc;
        }, { nodes: [node], links: []});
    },

    // transforms links into an array of arrays, where the inner arrays are
    // a list of x,y coordinates. Interpolating those coordinates will produce
    // a curved line connecting the source and target points. The result of rendering
    // all curves is that groups of edges with similar end points will appear to
    // be banded together
    bundleLinks: function() {
        const linkMap = this._links.map(link => ({ source: link.source.id, target: link.target.id }));

        const forceBundle = d3.ForceEdgeBundling()
            .nodes(this._nodeMap)
            .edges(linkMap)
            .bundling_stiffness(0.1)
            .compatibility_threshold(0.1);

        return forceBundle();
    },

    // function to interpolate over force bundled points to produce a curve
    curve: d3.line()
        .x(d => d.x)
        .y(d => d.y)
        .curve(d3.curveLinear),

    actions: {
      mutate: function() {
        this.sendAction('mutate');
      }
    }
});
