import Tweet from '../../models/tweet';
import User from '../../models/user';
import FavoriteTweet from '../../models/favorite_tweet';
import { pubsub } from '../../config/pubsub';
import { requireAuth } from '../../services/auth';

const TWEET_ADDED = 'tweetAdded';
const TWEET_FAVORITED = 'tweetFavorited';

export default {
  getUserTweets: async(_, args, { user }) => {
    await requireAuth(user);
    return Tweet.find({ user: user._id });
  },
  getTweets: async (_, args, { user }) => {
    await requireAuth(user);
    const p1 = Tweet.find({}).sort({ createdAt: -1 });
    const p2 = FavoriteTweet.findOne({ user_id: user._id });
    const [tweets, favorites] = await Promise.all([p1, p2]);

    const tweetsToSend = tweets.reduce((arr, tweet) => {
      const tw = tweet.toJSON();
      if (favorites.tweets.some(t => t.equals(tweet._id))) {
        arr.push({
          ...tw,
          isFavorited: true,
        });
      } else {
        arr.push({
          ...tw,
          isFavorited: false,
        });
      }

      return arr;
    }, []);

    return tweetsToSend;
  },
  favoriteTweet: async (_, { _id }, { user }) => {
    await requireAuth(user);
    const favorites = await FavoriteTweet.findOne({ user_id: user._id });
    if (favorites.tweets.some(t => t.equals(_id))) {
      const tweet = await Tweet.decFavoriteCount(_id);
      favorites.tweets.pull(_id);
      await favorites.save();
      const t = tweet.toJSON();
      pubsub.publish(TWEET_FAVORITED, { [TWEET_FAVORITED]: {
        ...t,
      } })
      return {
        isFavorited: false,
        ...t
      }
    }
    const tweet = await Tweet.incFavoriteCount(_id);
    favorites.tweets.push(_id);
    await favorites.save();
    const t = tweet.toJSON();
    pubsub.publish(TWEET_FAVORITED, { [TWEET_FAVORITED]: {
      ...t
    } })
    return {
      isFavorited: true,
      ...t
    }
  },
  createTweet: async (_, { text }, { user }) => {
    try {
      const tweet = await Tweet.create({ text, user: user._id })
      await User.incTweetsNumber(user._id);
      pubsub.publish(TWEET_ADDED, { [TWEET_ADDED]: tweet });

      return tweet;
    } catch (error) {
      return null;
    }
  },
  tweetAdded: {
    subscribe: () => pubsub.asyncIterator(TWEET_ADDED)
  },
  tweetFavorited: {
    subscribe: () => pubsub.asyncIterator(TWEET_FAVORITED)
  }
};
