//Basic Requirement
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { default: Stripe } = require('stripe');
const app = express()
const port = process.env.PORT || 5000



//middleware

app.use(express.json())
app.use(cors())
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);




//create token
app.post('/authentication', async (req, res) => {
    const userEmail = req.body
    const token = jwt.sign(userEmail, process.env.ACCESS_TOKEN, { expiresIn: '10d' })
    res.send({ token })
})



//mongodb code will appear here

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rvjkksn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, } });

async function run() {
    try {

        await client.connect();

        //server code will appear here
        const usersCollection = client.db('NextGen_Mobiles').collection('users')
        const productsCollection = client.db('NextGen_Mobiles').collection('products')
        const cartsCollection = client.db('NextGen_Mobiles').collection('carts')



        //verify jwt
        const verifyJWT = (req, res, next) => {
            const authorization = req.headers.authorization
            if (!authorization) {
                return res.status(401).send({ error: true, message: 'Unauthorized Access - No Token Provided' });
            }
            const token = authorization.split(' ')[1]

            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ error: true, message: 'Unauthorized Access - Invalid Token' });
                }
                req.decoded = decoded;
                next();
            });
        }
        //verify seller
        const verifySeller = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };

            try {
                const user = await usersCollection.findOne(query);

                if (user?.role !== 'seller') {
                    return res.status(403).send({ error: true, message: 'Forbidden - Not a Seller' });
                }
                next();
            } catch (error) {
                res.status(500).send({ error: true, message: 'Internal Server Error' });
            }
        }

        //verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            try {
                const user = await usersCollection.findOne(query);
                if (user?.role !== 'admin') {
                    return res.status(403).send({ error: true, message: 'Forbidden - Not an Admin' });
                }
                next();
            } catch (error) {
                res.status(500).send({ error: true, message: 'Internal Server Error' });
            }
        }
        //all users get
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const users = await usersCollection.find().toArray();
                res.send(users);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to get users', error: error.message });
            }
        });




        //email based info
        app.get('/users/:email', async (req, res) => {
            const query = { email: req.params.email }
            const user = await usersCollection.findOne(query)
            res.send(user)
        })

        //users post
        app.post('/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            } else {
                const result = await usersCollection.insertOne(user)
                res.send(result)
            }
        })

        // specific id user delete
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            try {
                const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 1) {
                    res.send({ success: true, message: 'User successfully deleted' });
                } else {
                    res.status(404).send({ success: false, message: 'User not found' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to delete user', error: error.message });
            }
        });

        //role update
        app.patch('/update-user-role/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            const allowedRoles = ['buyer', 'seller', 'admin'];
            if (!allowedRoles.includes(role)) {
                return res.status(400).send({ success: false, message: 'Invalid role specified' });
            }

            try {
                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: { role } };
                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'User role updated successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'User not found or role is the same' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to update user role', error: error.message });
            }
        });


        //add-products
        app.post('/add-product', verifyJWT, verifySeller, async (req, res) => {
            const product = req.body
            const result = await productsCollection.insertOne(product)
            res.send(result)
        })
        //get user specific products
        app.get('/user/products', verifyJWT, verifySeller, async (req, res) => {
            const email = req.decoded.email;
            try {
                const products = await productsCollection.find({ email }).toArray();
                res.send(products);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to get products', error: error.message });
            }
        });

        // API to get product details by ID
        app.get('/product/:id', async (req, res) => {
            const productId = req.params.id;

            try {
                // Check if ID is valid
                if (!ObjectId.isValid(productId)) {
                    return res.status(400).json({ success: false, message: 'Invalid Product ID' });
                }

                // Fetch product from the database
                const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                if (!product) {
                    return res.status(404).json({ success: false, message: 'Product not found' });
                }

                res.json({ success: true, product });
            } catch (error) {
                console.error('Error fetching product details:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        });
        //add wishlist
        app.patch('/wishlist', verifyJWT, async (req, res) => {
            const { userEmail, productId } = req.body;

            try {

                app.get('/product/:id', async (req, res) => {
                    const productId = req.params.id;

                    try {

                        if (!ObjectId.isValid(productId)) {
                            return res.status(400).json({ success: false, message: 'Invalid Product ID' });
                        }

                        // Fetch product from the database
                        const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                        if (!product) {
                            return res.status(404).json({ success: false, message: 'Product not found' });
                        }

                        res.json({ success: true, product });
                    } catch (error) {
                        console.error('Error fetching product details:', error);
                        res.status(500).json({ success: false, message: 'Internal Server Error' });
                    }
                });

                // Update wishlist
                const result = await usersCollection.updateOne(
                    { email: userEmail },
                    {
                        $addToSet: { wishList: new ObjectId(String(productId)) }
                    }
                );
                res.send(result)

            } catch (error) {
                console.error('Error adding product to wishlist:', error);
                res.status(500).send({ success: false, message: 'Failed to add to wishlist', error: error.message });
            }
        });

        //get wishlist
        app.get('/wishlist/:userId', verifyJWT, async (req, res) => {
            const userId = req.params.userId;
            const decodedUserId = req.decoded.userId;

            try {
                const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

                if (!user || !user.wishList || user.wishList.length === 0) {
                    return res.status(404).send({ success: false, message: 'Wishlist is empty' });
                }

                const wishlistProductIds = user.wishList.map((id) => new ObjectId(id));

                const products = await productsCollection
                    .find({ _id: { $in: wishlistProductIds } })
                    .toArray();

                res.send(products);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to get wishlist', error: error.message });
            }
        });

        //remove wishlist
        app.delete('/wishlist/:userId/:productId', verifyJWT, async (req, res) => {
            const userId = req.params.userId;
            const productId = req.params.productId;
            const decodedUserId = req.decoded.userId;

            try {

                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $pull: { wishList: new ObjectId(productId) } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Product removed from wishlist' });
                } else {
                    res.send({ success: false, message: 'Product not found in wishlist' });
                }
            } catch (error) {
                res.status(500).send({ error: true, message: 'Failed to remove product from wishlist' });
            }
        });













        // Add product to cart and decrease stock in products collection
        app.post('/add-to-cart', verifyJWT, async (req, res) => {
            const { userEmail, productId, quantity } = req.body;

            // Basic validation
            if (!userEmail || !productId || !quantity) {
                return res.status(400).send({ success: false, message: 'Please provide userEmail, productId, and quantity' });
            }

            try {
                // Step 1: Check if the product exists
                const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                if (!product) {
                    return res.status(404).send({ success: false, message: 'Product not found' });
                }

                const stock = Number(product.stock); // Convert stock to a number
                if (isNaN(stock) || stock < quantity) {
                    return res.status(400).send({
                        success: false,
                        message: 'Insufficient stock available for the requested product',
                    });
                }

                // Step 2: Check if the cart already contains the product
                const existingCart = await cartsCollection.findOne({ email: userEmail });

                if (existingCart) {
                    const existingProduct = existingCart.products.find(item => item.productId.toString() === productId);

                    if (existingProduct) {
                        // If the product is already in the cart, increase the quantity
                        const newQuantity = existingProduct.quantity + quantity;

                        await cartsCollection.updateOne(
                            { email: userEmail, "products.productId": productId },
                            { $set: { "products.$.quantity": newQuantity } }
                        );
                    } else {
                        // If the product is not in the cart, add it
                        await cartsCollection.updateOne(
                            { email: userEmail },
                            {
                                $push: {
                                    products: {
                                        productId: new ObjectId(productId),
                                        title: product.title,
                                        price: product.price,
                                        imageURL: product.imageURL,
                                        stock: product.stock,
                                        quantity: quantity,
                                    },
                                },
                            }
                        );
                    }
                } else {
                    // If the cart doesn't exist, create a new cart and add the product
                    const newCart = {
                        email: userEmail,
                        products: [
                            {
                                productId: new ObjectId(productId),
                                title: product.title,
                                price: product.price,
                                imageURL: product.imageURL,
                                stock: product.stock,
                                quantity: quantity,
                            },
                        ],
                    };
                    await cartsCollection.insertOne(newCart);
                }

                // Step 3: Decrease the stock in the products collection
                const newStock = stock - quantity;
                await productsCollection.updateOne(
                    { _id: new ObjectId(productId) },
                    { $set: { stock: newStock } }
                );

                // Step 4: Return success response
                res.send({
                    success: true,
                    message: 'Product added to cart and stock decreased',
                });
            } catch (error) {
                console.error('Error adding product to cart:', error);
                res.status(500).send({ success: false, message: 'Failed to add product to cart', error: error.message });
            }
        });



        app.get('/cart/:userEmail', verifyJWT, async (req, res) => {
            try {
                const userEmail = req.params.userEmail;



                const cart = await cartsCollection.findOne({ email: userEmail });


                if (!cart) {
                    return res.status(404).send({ success: false, message: 'Cart not found for this user.' });
                }

                res.status(200).send({ success: true, cart: cart.products });
            } catch (error) {
                console.error('Error fetching cart data:', error);
                res.status(500).send({ success: false, message: 'Failed to fetch cart data.' });
            }
        });



        app.get('/cart/:userEmail', verifyJWT, async (req, res) => {
            try {
                const userEmail = req.params.userEmail;


                const cart = await cartsCollection.findOne({ email: userEmail });

                if (!cart) {
                    return res.status(404).send({ success: false, message: 'Cart not found for this user.' });
                }


                res.status(200).send({ success: true, cart: cart.products });
            } catch (error) {
                console.error('Error fetching cart data:', error);
                res.status(500).send({ success: false, message: 'Failed to fetch cart data.' });
            }
        });





        // Delete a specific product from the user's cart




        app.delete('/cart/:userEmail/:productId', verifyJWT, async (req, res) => {
            const userEmail = req.params.userEmail;
            let productId;

            try {
                // Ensure productId is an ObjectId
                productId = new ObjectId(req.params.productId);

                // Fetch the user's cart
                const cart = await cartsCollection.findOne({ email: userEmail });

                if (!cart) {
                    return res.status(404).send({ success: false, message: 'Cart not found for this user.' });
                }

                // Check if the product exists in the user's cart
                const productIndex = cart.products.findIndex(product => product.productId.toString() === productId.toString());

                if (productIndex === -1) {
                    return res.status(404).send({ success: false, message: 'Product not found in cart.' });
                }

                // Remove the product from the cart
                const updatedCart = await cartsCollection.updateOne(
                    { email: userEmail },
                    { $pull: { products: { productId } } }
                );

                if (updatedCart.modifiedCount > 0) {
                    return res.send({ success: true, message: 'Product removed from cart successfully.' });
                } else {
                    return res.status(400).send({ success: false, message: 'Failed to remove product from cart.' });
                }
            } catch (error) {
                console.error('Error removing product from cart:', error);
                return res.status(500).send({ success: false, message: 'Failed to remove product from cart', error: error.message });
            }
        });










        //all products
        app.get('/all-products', async (req, res) => {
            const { title, sort, category, brand, page = 1, limit = 3 } = req.query
            const query = {}
            if (title) {
                query.title = { $regex: title, $options: 'i' }
            }
            if (category) {
                query.category = { $regex: category, $options: 'i' }
            }
            if (brand) {
                query.brand = brand
            }

            const currentPage = parseInt(page) || 1;
            const itemsPerPage = parseInt(limit) || 3;
            const skip = (currentPage - 1) * itemsPerPage;

            const sortOptions = sort === 'asc' ? 1 : -1
            const products = await productsCollection.find(query)
                .skip(skip)
                .limit(itemsPerPage)
                .sort({ price: sortOptions }).toArray()

            const productInfo = await productsCollection.find({}, { projection: { category: 1, brand: 1 } }).toArray()

            const totalProduct = await productsCollection.countDocuments(query);
            const brands = [...new Set(productInfo.map(product => product.brand))]
            const categories = [...new Set(productInfo.map(product => product.category))]
            res.send({ products, brands, categories, totalProduct })

        })


        // Update a specific product by the seller
        app.patch('/user/products/:id', verifyJWT, verifySeller, async (req, res) => {
            const productId = req.params.id;
            const email = req.decoded.email;
            const updates = req.body;

            try {

                const product = await productsCollection.findOne({ _id: new ObjectId(productId), email });


                if (!product) {
                    return res.status(403).send({ error: true, message: 'Forbidden - Product not found or you are not the owner' });
                }

                const filter = { _id: new ObjectId(productId), email };
                const updateDoc = { $set: updates };

                const result = await productsCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Product updated successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'Product not found or no changes made' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to update product', error: error.message });
            }
        });




        // Delete seller-specific product
        app.delete('/user/products/:id', verifyJWT, verifySeller, async (req, res) => {
            const productId = req.params.id;
            const email = req.decoded.email;

            try {

                const product = await productsCollection.findOne({ _id: new ObjectId(productId), email });


                if (!product) {
                    return res.status(403).send({ error: true, message: 'Forbidden - Product not found or you are not the owner' });
                }


                const result = await productsCollection.deleteOne({ _id: new ObjectId(productId) });


                if (result.deletedCount === 1) {
                    res.send({ success: true, message: 'Product deleted successfully' });
                } else {
                    res.status(404).send({ success: false, message: 'Product not found' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to delete product', error: error.message });
            }
        });




        //payment implementation
        app.post('/create-payment', async (req, res) => {
            const { amount, currency } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency,
                });

                res.status(200).send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                console.error('Error creating payment intent:', error);
                res.status(500).send({ error: error.message });
            }
        });







        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

// Simple Api's

app.get('/', (req, res) => {
    res.send('NextGen Mobiles Server is Running ')
})



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})